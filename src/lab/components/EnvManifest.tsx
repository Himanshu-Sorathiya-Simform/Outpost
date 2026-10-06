import { useCallback, useEffect, useState } from 'react'
import { matchRoutes } from 'react-router'
import { routes } from '@/router'
import { AppError, type AppErrorKind } from '@/lib/errors/app-error'
import { loadManifest, probeUrl, type CheckContext, type ManifestCheck, type ManifestLoad } from '../observers/manifest-load'
import { runManifestChecks } from '../observers/manifest-rules'
import { Button, Disclosure, ErrorState, JsonView, KeyValue, Loader, Plate, StatusDot, TimeAgo } from '@/ui'
import { EnvManifestChecks } from './EnvManifestChecks'
import styles from './EnvManifest.module.css'

type ErrorLoad = Extract<ManifestLoad, { kind: 'error' }>

const routeExists = (pathname: string): boolean => {
  const matches = matchRoutes(routes, pathname)
  const last = matches?.[matches.length - 1]
  return last !== undefined && last.route.path !== '*'
}

function toAppError(load: ErrorLoad): AppError {
  const kind: AppErrorKind = load.reason === 'network' ? (navigator.onLine ? 'network' : 'offline') : load.reason === 'timeout' ? 'timeout' : load.reason === 'http' ? (load.status === 404 ? 'not-found' : 'http') : 'parse'
  return new AppError({ kind, message: load.message, userMessage: load.message, retryable: true, context: { url: load.href, status: load.status ?? undefined, source: 'lab:manifest' } })
}

function Absent() {
  return (
    <div className={styles.absent}>
      <p className={styles.lede}>
        <strong>No manifest is linked.</strong> This page has no <code>&lt;link rel=&quot;manifest&quot;&gt;</code>, so the browser has nothing to install from. Until you add one, there is nothing to check.
      </p>
      <p className={styles.sub}>What to add</p>
      <ol className={styles.steps}>
        <li>
          A file the server can serve, for example <code>public/manifest.webmanifest</code>. The server already answers <code>.webmanifest</code> as <code>application/manifest+json</code>.
        </li>
        <li>
          One line in the <code>&lt;head&gt;</code> of <code>index.html</code>: <code>&lt;link rel=&quot;manifest&quot; href=&quot;/manifest.webmanifest&quot;&gt;</code>
        </li>
        <li>
          Icons: <code>public/icons</code> already holds <code>icon-192.png</code>, <code>icon-512.png</code> and <code>maskable-512.png</code>. Point the manifest at them.
        </li>
        <li>Reload this page. The checklist appears here with a verdict per member.</li>
      </ol>
      <p className={styles.sub}>Members the checklist looks for</p>
      <ul className={styles.members}>
        <li>name, short_name</li>
        <li>start_url, scope, id</li>
        <li>display (not &quot;browser&quot;)</li>
        <li>theme_color, background_color</li>
        <li>icons: 192, 512, one maskable</li>
        <li>shortcuts to /file, /inbox, /signal</li>
        <li>share_target to /share-target</li>
        <li>protocol_handlers to /handle, with %s</li>
        <li>launch_handler, screenshots</li>
      </ul>
    </div>
  )
}

/** Finds the linked manifest, fetches it fresh, prints it, and runs the installability checks against it. */
export function EnvManifest() {
  const [load, setLoad] = useState<ManifestLoad | null>(null)
  const [checks, setChecks] = useState<ManifestCheck[] | null>(null)
  const [run, setRun] = useState(0)

  const reload = useCallback(() => {
    setLoad(null)
    setChecks(null)
    setRun((n) => n + 1)
  }, [])

  useEffect(() => {
    let current = true
    void loadManifest().then(async (result) => {
      if (!current) return
      setLoad(result)
      if (result.kind !== 'ok') return
      const ctx: CheckContext = { manifestUrl: new URL(result.href), pageOrigin: location.origin, routeExists, probe: probeUrl }
      const list = await runManifestChecks(result.manifest, ctx)
      if (current) setChecks(list)
    })
    return () => {
      current = false
    }
  }, [run])

  const mime = load?.kind === 'ok' ? load.contentType : null
  return (
    <Plate
      index="Nº 0003"
      title="Manifest and installability"
      aria-busy={load === null}
      actions={
        <Button size="sm" icon="refresh" loading={load === null} onClick={reload}>
          Fetch again
        </Button>
      }
    >
      <div className={styles.body}>
        {load === null ? (
          <div role="status">
            <Loader label="Fetching the manifest" size="sm" />
          </div>
        ) : load.kind === 'absent' ? (
          <Absent />
        ) : load.kind === 'error' ? (
          <ErrorState error={toAppError(load)} onRetry={reload} />
        ) : (
          <>
            <KeyValue
              dense
              items={[
                { label: 'Linked at', value: load.href },
                { label: 'Answered', value: <StatusDot tone="ok" label={`${load.status}, fetched without the HTTP cache`} /> },
                {
                  label: 'Content-Type',
                  value: <StatusDot tone={mime?.includes('manifest+json') ? 'ok' : 'warn'} label={mime ?? 'missing'} />,
                },
                { label: 'Cache-Control', value: load.cacheControl ?? 'none sent' },
                { label: 'Fetched', value: <TimeAgo at={load.loadedAt} /> },
              ]}
            />
            <EnvManifestChecks checks={checks} />
            <Disclosure summary="Manifest as parsed" meta={`${Object.keys(load.manifest).length} members`} defaultOpen>
              <JsonView value={load.manifest} title="manifest" expandDepth={1} maxHeight={360} />
            </Disclosure>
          </>
        )}
      </div>
    </Plate>
  )
}
