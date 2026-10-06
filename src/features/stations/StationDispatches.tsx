import { Link } from 'react-router'
import { useLabSetting } from '@/lib'
import { useDispatchFeed } from '@/lib/queries'
import { EmptyState, ErrorState, LinkButton, Plate, ProvenanceChip, SeverityStamp, Skeleton, TimeAgo } from '@/ui'
import { FreshnessNote } from './FreshnessNote'
import { currentFailure } from './freshness'
import styles from './StationDispatches.module.css'

const LIMIT = 6

/** The latest dispatches filed from one station, each linking to its full entry. */
export function StationDispatches({ code }: { code: string }) {
  const feed = useDispatchFeed({ station: code, limit: LIMIT })
  const showProvenance = useLabSetting('showProvenance')
  const { items, isFetching, dataUpdatedAt } = feed
  const error = currentFailure(feed)
  const hasData = feed.data !== undefined
  const retry = (): void => void feed.refetch()
  const recent = items.slice(0, LIMIT)

  return (
    <Plate index="Nº 0302" title="Recent dispatches from this station" actions={showProvenance ? <ProvenanceChip meta={feed.meta} /> : null} aria-busy={isFetching && !hasData}>
      {hasData ? (
        <div className={styles.body}>
          <FreshnessNote noun="dispatch list" meta={feed.meta} dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} error={error} failureCount={feed.failureCount} onRetry={retry} />
          {recent.length === 0 ? (
            <EmptyState title={`Nothing filed from ${code}`} icon="log" compact>
              No dispatch on the log names this station.
            </EmptyState>
          ) : (
            <ol className={styles.list}>
              {recent.map((d) => (
                <li key={d.id} className={styles.row}>
                  <SeverityStamp severity={d.severity} size="sm" flat />
                  <Link to={`/log/${encodeURIComponent(d.id)}`} className={styles.title}>
                    {d.title}
                  </Link>
                  <span className={styles.when}>
                    <TimeAgo at={d.filedAt} />, {d.filedBy}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <LinkButton to={`/log?station=${encodeURIComponent(code)}`} variant="quiet" size="sm" iconEnd="arrow-right">
            All dispatches from {code}
            {feed.total !== undefined && feed.total > recent.length ? ` (${feed.total})` : ''}
          </LinkButton>
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={retry} retrying={isFetching} />
      ) : (
        <div className={styles.body} role="status" aria-label="Loading dispatches">
          <Skeleton lines={4} />
        </div>
      )}
    </Plate>
  )
}
