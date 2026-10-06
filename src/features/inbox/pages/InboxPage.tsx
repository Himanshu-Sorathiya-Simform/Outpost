import { useEffect, useRef } from 'react'
import { useDispatchFeed, useInbox, useMarkAllRead, useSession } from '@/lib/queries'
import { useLabSetting } from '@/lib/settings'
import { BadgeReadout } from '../BadgeReadout'
import { FreshnessNotice } from '../FreshnessNotice'
import { InboxRow } from '../InboxRow'
import { LogClear } from '../LogClear'
import { MarkAllRead } from '../MarkAllRead'
import { useTriage } from '../useTriage'
import { useTriageKeys } from '../useTriageKeys'
import { Button, EmptyState, ErrorState, Kbd, Loader, LoadMore, PageHeader, Plate, ProvenanceChip, Skeleton, Stat, StatGroup, Tag } from '@/ui'
import styles from './InboxPage.module.css'

const FEED_FILTERS = { unread: true, limit: 30 } as const
const isUrgent = (severity: string): boolean => severity === 'urgent' || severity === 'critical'

function ListSkeleton() {
  return (
    <Plate flush title="Unread" aria-busy="true">
      <Loader label="Receiving the unread list" className={styles.loader} />
      <ul className={styles.skeletons}>
        {[0, 1, 2, 3].map((n) => (
          <li key={n}>
            <Skeleton variant="line" width="30%" />
            <Skeleton variant="title" width="70%" />
            <Skeleton variant="line" lines={2} />
          </li>
        ))}
      </ul>
    </Plate>
  )
}

function KeyLegend() {
  return (
    <p className={styles.keys}>
      <span className={styles.keysLabel}>Keys</span>
      <span>
        <Kbd keys="j" /> <Kbd keys="k" /> move
      </span>
      <span>
        <Kbd keys="Enter" /> open
      </span>
      <span>
        <Kbd keys="r" /> read
      </span>
      <span>
        <Kbd keys="s" /> star
      </span>
      <span>
        <Kbd keys="a" /> acknowledge
      </span>
    </p>
  )
}

export default function InboxPage() {
  const inbox = useInbox()
  const feed = useDispatchFeed(FEED_FILTERS)
  const session = useSession()
  const markAll = useMarkAllRead()
  const showProvenance = useLabSetting('showProvenance')

  const signedOut = session.data !== undefined && session.data.session === null
  const triage = useTriage(feed.items, signedOut)
  const keys = useTriageKeys(triage.rows, triage)

  const summary = inbox.data
  const unread = summary?.unread
  const urgent = triage.rows.filter((r) => isUrgent(r.severity))
  const rest = triage.rows.filter((r) => !isUrgent(r.severity))
  const loadedAll = !feed.hasNextPage

  const clear = feed.isSuccess && triage.rows.length === 0 && !feed.isFetching
  const disagrees = clear && unread !== undefined && unread > 0
  const clearRef = useRef<HTMLDivElement>(null)
  const wasClear = useRef(false)
  useEffect(() => {
    // The last row just left and took the keyboard focus with it: land on the result instead of on the page body.
    if (clear && !wasClear.current && (document.activeElement === document.body || document.activeElement === null)) clearRef.current?.focus()
    wasClear.current = clear
  }, [clear])

  const row = (item: (typeof triage.rows)[number]) => (
    <InboxRow
      key={item.id}
      item={item}
      active={keys.activeId === item.id}
      leaving={triage.leavingIds.has(item.id)}
      registerRef={keys.registerRef}
      onActivate={keys.activate}
      onRead={triage.markRead}
      onStar={triage.toggleStar}
      onAcknowledge={triage.acknowledge}
    />
  )

  return (
    <>
      <PageHeader
        eyebrow="Register / Unread triage"
        title="Inbox"
        description="Everything nobody has read yet, worst first. Work down the list; a row leaves once it is read or acknowledged."
        actions={<MarkAllRead unread={unread} pending={markAll.isPending} onMarkAll={() => markAll.mutate()} />}
        meta={
          showProvenance ? (
            <div className={styles.chips}>
              <span className={styles.chipLabel}>Counters</span>
              <ProvenanceChip meta={inbox.meta} />
              <span className={styles.chipLabel}>List</span>
              <ProvenanceChip meta={feed.meta} />
            </div>
          ) : undefined
        }
      />

      <div className={styles.layout}>
        <div className={styles.counters}>
          <StatGroup>
            <Stat
              size="lg"
              label="Unread"
              tone={unread === undefined ? 'default' : unread > 0 ? 'accent' : 'ok'}
              value={inbox.isPending ? <Skeleton variant="title" width="2ch" /> : (unread ?? '--')}
              note={summary ? `of ${summary.total} on file` : undefined}
            />
            <Stat
              size="lg"
              label="Urgent and critical"
              tone={summary && summary.urgentUnread > 0 ? 'error' : 'default'}
              value={inbox.isPending ? <Skeleton variant="title" width="2ch" /> : (summary?.urgentUnread ?? '--')}
              note="still unread"
            />
          </StatGroup>
          <FreshnessNotice
            subject="counters"
            meta={inbox.meta}
            hasData={summary !== undefined}
            isError={inbox.isError}
            error={inbox.error}
            isFetching={inbox.isFetching}
            onRetry={() => void inbox.refetch()}
          />
          {inbox.error && summary === undefined ? (
            <ErrorState compact error={inbox.error} retrying={inbox.isFetching} onRetry={() => void inbox.refetch()} />
          ) : null}
          {markAll.error ? (
            <ErrorState
              compact
              error={markAll.error}
              retryLabel="Try again"
              onRetry={() => markAll.mutate()}
              retrying={markAll.isPending}
              actions={
                <Button variant="quiet" onClick={() => markAll.reset()}>
                  Dismiss
                </Button>
              }
            />
          ) : null}
        </div>

        <section className={styles.list} aria-label="Unread dispatches" aria-busy={feed.isFetching && !feed.isPending}>
          <p className="sr-only" role="status" aria-live="polite">
            {triage.announcement}
          </p>
          {feed.isPending ? <ListSkeleton /> : null}

          {feed.error && triage.rows.length === 0 ? (
            <ErrorState
              error={feed.error}
              onRetry={() => void feed.refetch()}
              retrying={feed.isFetching}
              retryLabel="Load the list again"
              actions={unread !== undefined && unread > 0 ? <Tag tone="warn">Counter says {unread} unread</Tag> : undefined}
            />
          ) : null}

          {clear && !disagrees ? (
            <div ref={clearRef} tabIndex={-1} className={styles.result}>
              <LogClear total={summary?.total} asOf={feed.meta?.servedAt ?? feed.meta?.fetchedAt}>
                <FreshnessNotice
                  subject="unread list"
                  meta={feed.meta}
                  hasData
                  isError={feed.isError}
                  error={feed.error}
                  isFetching={feed.isFetching}
                  onRetry={() => void feed.refetch()}
                />
              </LogClear>
            </div>
          ) : null}

          {disagrees ? (
            <div ref={clearRef} tabIndex={-1} className={styles.result}>
              <EmptyState
                icon="warning"
                title="Counter and list disagree"
                action={
                  <Button icon="refresh" onClick={() => void Promise.all([feed.refetch(), inbox.refetch()])}>
                    Fetch both again
                  </Button>
                }
              >
                The counter says {unread} unread, but the list came back empty. One of them is older than the other. Fetch both again, or compare them against
                the server in the Badge panel.
              </EmptyState>
            </div>
          ) : null}

          {triage.rows.length > 0 ? (
            <>
              <FreshnessNotice
                subject="unread list"
                meta={feed.meta}
                hasData
                isError={feed.isError}
                error={feed.error}
                isFetching={feed.isFetching}
                onRetry={() => void feed.refetch()}
              />
              <KeyLegend />
              <div className={styles.groups}>
                <Plate
                  flush
                  index="Sec. A"
                  title="Urgent and critical"
                  actions={<Tag tone={urgent.length > 0 ? 'error' : 'neutral'}>{urgent.length} shown</Tag>}
                >
                  {urgent.length > 0 ? (
                    <ol className={styles.rows}>{urgent.map(row)}</ol>
                  ) : (
                    <p className={styles.none}>
                      {loadedAll ? 'No urgent or critical dispatches are unread.' : 'None in the pages loaded so far. Load more below.'}
                    </p>
                  )}
                </Plate>
                {rest.length > 0 ? (
                  <Plate flush index="Sec. B" title="Everything else" actions={<Tag>{rest.length} shown</Tag>}>
                    <ol className={styles.rows}>{rest.map(row)}</ol>
                  </Plate>
                ) : null}
              </div>
              <LoadMore
                loaded={triage.rows.length}
                total={feed.total}
                hasMore={feed.hasNextPage}
                loading={feed.isFetchingNextPage}
                onLoadMore={() => void feed.fetchNextPage()}
                error={feed.isFetchNextPageError ? feed.error : null}
                noun="unread dispatches"
              />
            </>
          ) : null}
        </section>

        <aside className={styles.aside} aria-label="Badge readout">
          <BadgeReadout unread={unread} />
        </aside>
      </div>
    </>
  )
}
