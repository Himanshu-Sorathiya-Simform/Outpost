import { useMemo } from 'react'
import type { Station } from '@shared/contracts'
import { useLabSetting } from '@/lib'
import { useStations } from '@/lib/queries'
import { Button, EmptyState, ErrorState, PageHeader, Plate, ProvenanceChip, Skeleton } from '@/ui'
import { FreshnessNote } from '../FreshnessNote'
import { currentFailure } from '../freshness'
import { RetryNote } from '../RetryNote'
import { RevalidationStatus } from '../RevalidationStatus'
import { StationRegister } from '../StationRegister'
import { StationsTable } from '../StationsTable'
import { StationsToolbar } from '../StationsToolbar'
import { filterStations, sortStations, type StationChanges } from '../stations'
import { useMediaQuery } from '../useMediaQuery'
import { useStationChanges } from '../useStationChanges'
import { useStationView } from '../useStationView'
import styles from './StationsPage.module.css'

function summarise(changes: StationChanges, stations: readonly Station[]): string | null {
  if (changes.size === 0) return null
  const named = stations
    .filter((s) => changes.has(s.id))
    .slice(0, 3)
    .map((s) => `${s.code} (${changes.get(s.id)?.join(', ')})`)
  const more = changes.size - named.length
  return `The last revalidation changed ${changes.size === 1 ? 'one station' : `${changes.size} stations`}: ${named.join('; ')}${more > 0 ? `; and ${more} more` : ''}.`
}

function LedgerSkeleton({ failureCount }: { failureCount: number }) {
  return (
    <div className={styles.skeleton}>
      <div role="status" aria-label="Loading stations" className={styles.skeleton}>
        <Skeleton variant="title" width="40%" />
        <Skeleton lines={6} />
      </div>
      <RetryNote failureCount={failureCount} noun="station register" />
    </div>
  )
}

/** The station register: stale-while-revalidate made visible. Whatever arrives first is shown; what changes afterwards is stamped. */
export default function StationsPage() {
  const query = useStations()
  const showProvenance = useLabSetting('showProvenance')
  const view = useStationView()
  const narrow = useMediaQuery('(max-width: 640px)')
  const { data, isFetching, isPaused, dataUpdatedAt } = query
  const error = currentFailure(query)
  const { changes, batch } = useStationChanges(data, dataUpdatedAt)

  const visible = useMemo(() => (data ? sortStations(filterStations(data.items, view.filters), view.sort.key, view.sort.dir) : []), [data, view.filters, view.sort.key, view.sort.dir])
  const refresh = (): void => void query.refetch()

  return (
    <>
      <PageHeader
        eyebrow="Register / Stations"
        title="Stations"
        description="Every outpost on the network, whether it is still answering, and when we last heard from it."
        actions={
          <Button icon="refresh" loading={isFetching} onClick={refresh}>
            Refresh
          </Button>
        }
        meta={
          data ? (
            <>
              <RevalidationStatus dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} isPaused={isPaused} changeSummary={summarise(changes, data.items)} />
              {showProvenance ? <ProvenanceChip meta={query.meta} /> : null}
            </>
          ) : null
        }
      />

      {data ? (
        <FreshnessNote noun="station register" meta={query.meta} dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} error={error} failureCount={query.failureCount} onRetry={refresh} />
      ) : null}

      <Plate index="Nº 0300" title="Station register" aria-busy={isFetching && !data} className={styles.plate}>
        {data ? (
          data.items.length === 0 ? (
            <EmptyState title="The register is empty" icon="station">
              The relay returned no stations. Nothing has been commissioned, or the list is being rebuilt.
            </EmptyState>
          ) : (
            <div className={styles.body}>
              <StationsToolbar view={view} stations={data.items} shown={visible.length} sortPicker={narrow} />
              {visible.length === 0 ? (
                <EmptyState title="No station matches" icon="filter" compact action={<Button onClick={view.clear}>Clear filters</Button>}>
                  Nothing on the register fits those filters.
                </EmptyState>
              ) : narrow ? (
                <StationRegister stations={visible} changes={changes} batch={batch} />
              ) : (
                <StationsTable stations={visible} changes={changes} batch={batch} view={view} />
              )}
            </div>
          )
        ) : error ? (
          <ErrorState error={error} onRetry={refresh} retrying={isFetching} />
        ) : (
          <LedgerSkeleton failureCount={query.failureCount} />
        )}
      </Plate>
    </>
  )
}
