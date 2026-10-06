import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useParams } from 'react-router'
import { useDispatch } from '@/lib/queries'
import { useLabSetting } from '@/lib/settings'
import { usePageTitle } from '@/shell'
import { EmptyState, Loader, PageHeader, Skeleton } from '@/ui'
import { DispatchView } from '../components/DispatchView'
import { NotFiled } from '../components/NotFiled'
import { isLogLinkState } from '../filters'
import { dispatchIndex } from '../format'
import { findListedCopy, findNeighbours } from '../hooks/cachedCopies'
import { notFiledTitle } from '../notFiled'
import styles from './DispatchPage.module.css'

export default function DispatchPage() {
  const { id = '' } = useParams()
  const { state } = useLocation()
  const qc = useQueryClient()
  const query = useDispatch(id)
  const showProvenance = useLabSetting('showProvenance')

  const logSearch = isLogLinkState(state) ? state.search : ''
  const linkState = { search: logSearch }
  const backTo = `/log${logSearch}`

  // The detail request failed or is waiting for a signal: a cached list page may still hold this dispatch. A 404 is
  // the relay saying it does not exist, so a stale copy must not contradict it.
  const listed = query.data === undefined && query.error?.kind !== 'not-found' ? findListedCopy(qc, id) : undefined
  const dispatch = query.data ?? listed?.dispatch
  usePageTitle(dispatch?.title ?? (query.error ? notFiledTitle(id, query.error) : undefined))

  if (dispatch) {
    return (
      <DispatchView
        dispatch={dispatch}
        meta={query.data ? query.meta : listed?.meta}
        fromList={query.data === undefined}
        showProvenance={showProvenance}
        refetchError={query.error}
        paused={query.fetchStatus === 'paused'}
        fetching={query.isFetching}
        onRetry={() => void query.refetch()}
        neighbours={findNeighbours(qc, id, logSearch)}
        linkState={linkState}
        backTo={backTo}
      />
    )
  }

  if (query.error) return <NotFiled id={id} error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} backTo={backTo} />

  if (query.fetchStatus === 'paused') {
    return (
      <>
        <PageHeader eyebrow={`${dispatchIndex(id)} / Dispatch`} title={`Waiting for ${id}`} />
        <EmptyState title="Waiting for a signal" icon="offline">
          This dispatch is not stored on this device, and there is no link to fetch it. It will load when one returns.
        </EmptyState>
      </>
    )
  }

  return (
    <>
      <PageHeader eyebrow={`${dispatchIndex(id)} / Dispatch`} title="Receiving dispatch" />
      <div className={styles.loading} aria-busy="true">
        <Loader label={`Receiving ${id}`} />
        <Skeleton variant="block" height="14rem" />
        <Skeleton lines={4} />
      </div>
    </>
  )
}
