import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import type { Dispatch } from '@shared/contracts'
import { useDispatchFeed, useStations } from '@/lib/queries'
import { useLabSetting } from '@/lib/settings'
import { Button, EmptyState, ErrorState, LinkButton, LoadMore, Loader, PageHeader, ProvenanceChip } from '@/ui'
import { DispatchRow } from '../components/DispatchRow'
import { FilterBar } from '../components/FilterBar'
import { FreshnessNotice } from '../components/FreshnessNotice'
import { KeyLegend } from '../components/KeyLegend'
import { LogSkeleton } from '../components/LogSkeleton'
import { NewSincePill } from '../components/NewSincePill'
import { countActiveFilters, toFeedFilters, type LogLinkState } from '../filters'
import { dispatchIndex } from '../format'
import { useDispatchPatcher } from '../hooks/useDispatchPatcher'
import { useFeedDrift } from '../hooks/useFeedDrift'
import { useKeepRowFocus } from '../hooks/useKeepRowFocus'
import { useLogFilters } from '../hooks/useLogFilters'
import { useRowKeys } from '../hooks/useRowKeys'
import styles from './LogPage.module.css'

export default function LogPage() {
  const { values, update, clear } = useLogFilters()
  const { search } = useLocation()
  const feed = useDispatchFeed(toFeedFilters(values))
  const stations = useStations()
  const showProvenance = useLabSetting('showProvenance')
  const patcher = useDispatchPatcher()
  const [announcement, setAnnouncement] = useState('')

  const { items, total, meta } = feed
  const hasData = feed.data !== undefined
  const refetchError = feed.isError && !feed.isFetchNextPageError && hasData ? feed.error : null
  const revalidating = feed.isFetching && !feed.isFetchingNextPage && hasData
  const drift = useFeedDrift(feed.feedRev, !feed.isFetching)
  const active = countActiveFilters(values)
  const linkState = useMemo<LogLinkState>(() => ({ search }), [search])
  const byId = useMemo(() => new Map(items.map((d) => [d.id, d])), [items])

  const toggleStar = useCallback(
    (d: Dispatch) => {
      setAnnouncement(`${dispatchIndex(d.id)} ${d.starred ? 'star removed' : 'starred'}`)
      void patcher.change(d.id, { starred: !d.starred })
    },
    [patcher],
  )
  const toggleRead = useCallback(
    (d: Dispatch) => {
      setAnnouncement(`${dispatchIndex(d.id)} marked ${d.read ? 'unread' : 'read'}`)
      void patcher.change(d.id, { read: !d.read })
    },
    [patcher],
  )
  const focusKeeper = useKeepRowFocus(items.map((d) => d.id).join(' '))
  const listRef = focusKeeper.ref

  // A keyboard user who presses "Refresh" or "Load more" must not lose their place when that button goes away.
  const focusAfterLoad = useRef<number | null>(null)
  const loadMore = (): void => {
    const keyboard = document.activeElement instanceof HTMLElement && document.activeElement.matches(':focus-visible')
    focusAfterLoad.current = keyboard ? items.length : null
    void feed.fetchNextPage()
  }
  const refresh = (): void => {
    if (document.activeElement instanceof HTMLElement && document.activeElement.matches(':focus-visible')) listRef.current?.focus()
    drift.refresh()
  }
  const rowCount = items.length
  useEffect(() => {
    const from = focusAfterLoad.current
    if (from === null || rowCount <= from) return
    focusAfterLoad.current = null
    listRef.current?.querySelectorAll<HTMLElement>('[data-row-link]')[from]?.focus()
  }, [rowCount, listRef])
  const onKeys = useRowKeys({
    onStar: (id) => {
      const d = byId.get(id)
      if (d) toggleStar(d)
    },
    onToggleRead: (id) => {
      const d = byId.get(id)
      if (d) toggleRead(d)
    },
  })

  const count =
    total === undefined ? (feed.isPending ? 'Counting' : 'Count unknown') : active > 0 ? `${total} ${total === 1 ? 'match' : 'match the filters'}` : `${total} on file`

  return (
    <>
      <PageHeader
        eyebrow="Register / Dispatches"
        title="Dispatch log"
        description="Everything the stations have filed, newest first."
        actions={
          <LinkButton to="/file" variant="primary" icon="pen">
            File dispatch
          </LinkButton>
        }
        meta={
          <>
            <span className={styles.count} aria-live="polite">
              {count}
            </span>
            {showProvenance ? <ProvenanceChip meta={meta} /> : null}
            {revalidating ? <Loader label="Checking the relay" size="sm" /> : null}
          </>
        }
      />

      <div className={styles.body}>
        <FilterBar values={values} onChange={update} onClear={clear} stations={stations} />

        <div className={styles.status} role="status" aria-live="polite">
          <NewSincePill behind={drift.behind} onRefresh={refresh} refreshing={feed.isFetching} />
          <FreshnessNotice
            subject="log"
            meta={meta}
            hasData={hasData}
            refetchError={refetchError}
            paused={feed.fetchStatus === 'paused'}
            onRetry={() => void feed.refetch()}
            retrying={revalidating}
          />
        </div>

        {feed.isPending && feed.fetchStatus === 'paused' ? (
          <EmptyState title="Waiting for a signal" icon="offline">
            Nothing is stored on this device for this view yet. It will load when a link returns.
          </EmptyState>
        ) : feed.isPending ? (
          <LogSkeleton />
        ) : feed.isError && !hasData ? (
          <ErrorState error={feed.error} onRetry={() => void feed.refetch()} retrying={feed.isFetching} />
        ) : items.length === 0 ? (
          active > 0 ? (
            <EmptyState
              title="No dispatches match"
              icon="filter"
              action={
                <Button icon="x" onClick={clear}>
                  Clear filters
                </Button>
              }
            >
              {active === 1 ? 'Nothing on file matches that filter.' : `Nothing on file satisfies all ${active} filters at once. Loosen one, or start over.`}
            </EmptyState>
          ) : (
            <EmptyState
              title="Nothing on file"
              icon="log"
              action={
                <LinkButton to="/file" icon="pen">
                  File the first dispatch
                </LinkButton>
              }
            >
              No station has filed a dispatch yet. The first one will appear here.
            </EmptyState>
          )
        ) : (
          <>
            <KeyLegend />
            <ul className={styles.list} aria-label="Dispatches" aria-describedby="log-key-legend" tabIndex={-1} onKeyDown={onKeys} {...focusKeeper}>
              {items.map((d) => (
                <DispatchRow
                  key={d.id}
                  dispatch={d}
                  linkState={linkState}
                  starPending={patcher.isPending(d.id, 'starred')}
                  readPending={patcher.isPending(d.id, 'read')}
                  onToggleStar={toggleStar}
                  onToggleRead={toggleRead}
                />
              ))}
            </ul>
            <LoadMore
              loaded={items.length}
              total={total}
              hasMore={feed.hasNextPage}
              loading={feed.isFetchingNextPage}
              onLoadMore={loadMore}
              error={feed.isFetchNextPageError ? feed.error : null}
              noun="dispatches"
            />
          </>
        )}
        <p className="sr-only" role="status">
          {announcement}
        </p>
      </div>
    </>
  )
}
