import { useEffect, useMemo, type ReactNode } from 'react'
import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router'
import { AppError, errorCenter, kindForStatus, markChunkLoadFailed, toAppError, useLabSetting } from '@/lib'
import { Button, ErrorState, LinkButton, Logo, Plate, cx } from '@/ui'
import NotFoundPage from './pages/NotFoundPage'
import OfflinePage from './pages/OfflinePage'
import { zoneOf } from './zone'
import styles from './RouteError.module.css'

/** Errors already sent to the error centre. Keyed by the thrown value, so StrictMode remounts and re-renders do not repeat it. */
const reported = new WeakSet<object>()

/** What the router caught, as an AppError. A plain Error thrown while rendering is a `render` fault, like in ErrorBoundary. */
function normalize(thrown: unknown, pathname: string): AppError {
  const source = `route:${pathname}`
  if (isRouteErrorResponse(thrown)) {
    return new AppError({ kind: kindForStatus(thrown.status), message: `${thrown.status} ${thrown.statusText}`, context: { status: thrown.status, source } })
  }
  const error = toAppError(thrown, { source })
  if (error.kind !== 'unknown') return error
  return new AppError({ kind: 'render', message: error.message, cause: thrown, context: { source } })
}

function StaleScreen({ error, teach }: { error: AppError; teach: boolean }) {
  const navigate = useNavigate()
  const offline = !navigator.onLine
  return (
    <Plate index="Fig. 1" title={offline ? 'This screen is not stored here' : 'This screen did not load'} className={styles.plate}>
      <div className={styles.stale} role="alert">
        <p className={styles.lead}>
          {offline
            ? 'The device has no signal, and this screen was never saved for offline use. The code for it has to come over the network.'
            : 'The code for this screen could not be fetched. The usual cause is a newer version of the app replacing the files this tab still points at.'}
        </p>
        <p>Reload to fetch the current version. Anything you have not filed yet is kept in Drafts.</p>
        <div className={styles.actions}>
          <Button variant="primary" icon="refresh" onClick={() => void navigate(0)}>
            Reload
          </Button>
          <LinkButton to="/log" icon="log">
            Back to log
          </LinkButton>
        </div>
        {teach ? (
          <aside className={styles.teach}>
            <p className="label">What this teaches</p>
            <p>{error.hint}</p>
            <p className={styles.ref}>
              Ref {error.id} / {error.message}
            </p>
          </aside>
        ) : null}
      </div>
    </Plate>
  )
}

/**
 * The errorElement of every route. Decides what kind of failure it is looking at:
 * a 404 response is the not-found page, an offline failure is the offline page, a failed lazy chunk gets its own
 * explanation, and everything else is an ErrorState. Reports each failure to the error centre once.
 */
export function RouteError({ standalone = false }: { standalone?: boolean }) {
  const thrown = useRouteError()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const showProvenance = useLabSetting('showProvenance')
  const error = useMemo(() => normalize(thrown, pathname), [thrown, pathname])
  const isNotFound = isRouteErrorResponse(thrown) && thrown.status === 404
  const teach = zoneOf(pathname) === 'lab' || showProvenance

  useEffect(() => {
    if (isNotFound) return
    const key: object = typeof thrown === 'object' && thrown !== null ? thrown : error
    if (reported.has(key)) return
    reported.add(key)
    errorCenter.report(error, { source: `route:${pathname}`, silent: true })
    // A failed lazy route is the same stale-deploy signal as a failed preload: let the banner say so.
    if (error.kind === 'chunk-load') markChunkLoadFailed()
  }, [error, isNotFound, pathname, thrown])

  let body: ReactNode
  if (isNotFound) body = <NotFoundPage />
  else if (error.kind === 'offline') body = <OfflinePage />
  else if (error.kind === 'chunk-load') body = <StaleScreen error={error} teach={teach} />
  else {
    body = (
      <ErrorState
        error={error}
        detailOpen={zoneOf(pathname) === 'lab'}
        onRetry={() => void navigate(0)}
        retryLabel="Reload"
        actions={
          <>
            {error.retryable ? null : (
              <Button icon="refresh" onClick={() => void navigate(0)}>
                Reload
              </Button>
            )}
            <LinkButton to="/log" variant="quiet" icon="log">
              Back to log
            </LinkButton>
          </>
        }
      />
    )
  }

  return (
    <div className={cx(styles.wrap, standalone && styles.standalone)}>
      {standalone ? <Logo caption="Field dispatch log" size={30} /> : null}
      {isNotFound || error.kind === 'offline' ? null : <h1 className="sr-only">This screen could not be shown</h1>}
      {body}
    </div>
  )
}
