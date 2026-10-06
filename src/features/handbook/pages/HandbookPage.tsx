import { API } from '@shared/contracts'
import { useLabSetting } from '@/lib'
import { useHandbookIndex } from '@/lib/queries'
import { Button, EmptyState, ErrorState, PageHeader, Plate, ProvenanceChip, Skeleton, Tag, TimeAgo } from '@/ui'
import { FreshnessNote } from '@/features/stations/FreshnessNote'
import { currentFailure } from '@/features/stations/freshness'
import { RetryNote } from '@/features/stations/RetryNote'
import { NotStored, isNotStoredError } from '../NotStored'
import { StoredSummary } from '../StoredSummary'
import { TableOfContents } from '../TableOfContents'
import { useStoredOfflineMany } from '../useStoredOffline'
import styles from './HandbookPage.module.css'

/** The operating handbook: the cache-only page. It is meant to keep working with no link at all, and says which chapters will. */
export default function HandbookPage() {
  const query = useHandbookIndex()
  const showProvenance = useLabSetting('showProvenance')
  const { data, isFetching, dataUpdatedAt } = query
  const error = currentFailure(query)
  const chapters = data?.chapters ?? []
  const stored = useStoredOfflineMany(
    chapters.map((c) => API.handbookChapter(c.slug)),
    dataUpdatedAt,
  )
  const retry = (): void => void query.refetch()

  return (
    <>
      <PageHeader
        eyebrow="Register / Handbook"
        title="Handbook"
        description="Standing procedures for remote stations. It gets read at the worst moment, with the link down, so it is the one part of Outpost that ought to be on the device."
        actions={
          <Button icon="refresh" loading={isFetching} onClick={retry}>
            Refresh
          </Button>
        }
        meta={
          data ? (
            <>
              <Tag tone="accent" solid>
                Edition {data.edition}
              </Tag>
              <span className={styles.updated}>
                Revised <TimeAgo at={data.updatedAt} />
              </span>
              {showProvenance ? <ProvenanceChip meta={query.meta} /> : null}
            </>
          ) : null
        }
      />

      {data ? <FreshnessNote noun="chapter index" meta={query.meta} dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} error={error} failureCount={query.failureCount} onRetry={retry} /> : null}

      <Plate index="Nº 0600" title="Contents" aria-busy={isFetching && !data}>
        {data ? (
          data.chapters.length === 0 ? (
            <EmptyState title="The handbook has no chapters" icon="book" compact>
              The relay returned an empty index for edition {data.edition}.
            </EmptyState>
          ) : (
            <div className={styles.body}>
              <StoredSummary stored={stored.states} settled={stored.settled} total={data.chapters.length} />
              <TableOfContents chapters={data.chapters} recheckKey={dataUpdatedAt} />
            </div>
          )
        ) : error ? (
          isNotStoredError(error) ? (
            <NotStored error={error} subject="the list of chapters" onRetry={retry} retrying={isFetching} />
          ) : (
            <ErrorState error={error} onRetry={retry} retrying={isFetching} />
          )
        ) : (
          <div className={styles.body} role="status" aria-label="Loading the contents">
            <Skeleton variant="title" width="45%" />
            <Skeleton lines={6} />
            <RetryNote failureCount={query.failureCount} noun="list of chapters" />
          </div>
        )}
      </Plate>
    </>
  )
}
