import { useParams } from 'react-router'
import type { AppError } from '@/lib/errors/app-error'
import { useLabSetting } from '@/lib'
import { useStation, useStations } from '@/lib/queries'
import { usePageTitle } from '@/shell'
import { Button, EmptyState, ErrorState, LinkButton, PageHeader, Plate, ProvenanceChip, Skeleton, StatusDot, Tag } from '@/ui'
import { FreshnessNote } from '../FreshnessNote'
import { currentFailure } from '../freshness'
import { LocatorMap } from '../LocatorMap'
import { RetryNote } from '../RetryNote'
import { StationDispatches } from '../StationDispatches'
import { StationFacts } from '../StationFacts'
import { StationSignal } from '../StationSignal'
import { StationThumb } from '../StationThumb'
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE } from '../stations'
import styles from './StationPage.module.css'

/** Offline and unreachable get their own wording: "not found" would be a lie about a station that simply is not stored. */
const UNREACHABLE: ReadonlySet<AppError['kind']> = new Set<AppError['kind']>(['offline', 'network', 'timeout', 'cache-miss', 'unavailable'])

function Missing({ code }: { code: string }) {
  return (
    <>
      <PageHeader eyebrow="Register / Stations" title="No such station" />
      <EmptyState title={`Nothing is filed under ${code}`} icon="station" action={<LinkButton to="/stations" icon="arrow-left">All stations</LinkButton>}>
        The relay answered, and it has no station with that code or id. Check the spelling, or pick one from the register.
      </EmptyState>
    </>
  )
}

function Unreachable({ error, code, retrying, onRetry }: { error: AppError; code: string; retrying: boolean; onRetry: () => void }) {
  return (
    <>
      <PageHeader eyebrow="Register / Stations" title={code} />
      <ErrorState
        error={error}
        onRetry={onRetry}
        retrying={retrying}
        actions={
          <>
            {UNREACHABLE.has(error.kind) ? <span className={styles.hint}>This station has no stored copy on this device, so there is nothing to show in its place.</span> : null}
            <LinkButton to="/stations" variant="quiet" size="sm" icon="arrow-left">
              All stations
            </LinkButton>
          </>
        }
      />
    </>
  )
}

export default function StationPage() {
  const { code = '' } = useParams<{ code: string }>()
  const query = useStation(code || undefined)
  const register = useStations()
  const showProvenance = useLabSetting('showProvenance')
  const { data: station, isFetching, dataUpdatedAt } = query
  const error = currentFailure(query)
  usePageTitle(station ? `${station.code} ${station.name}` : undefined)
  const refresh = (): void => void query.refetch()

  if (!station) {
    if (error?.kind === 'not-found') return <Missing code={code} />
    if (error) return <Unreachable error={error} code={code} retrying={isFetching} onRetry={refresh} />
    return (
      <>
        <PageHeader eyebrow="Register / Stations" title={code} description="Opening the register entry." />
        <div className={styles.skeleton} role="status" aria-label="Loading station">
          <Skeleton variant="block" height={220} />
          <Skeleton lines={5} />
        </div>
        <RetryNote failureCount={query.failureCount} noun="station entry" />
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow={`Register / Stations / ${station.code}`}
        title={station.name}
        description={station.blurb}
        actions={
          <>
            <LinkButton to="/stations" icon="arrow-left">
              All stations
            </LinkButton>
            <Button icon="refresh" loading={isFetching} onClick={refresh}>
              Refresh
            </Button>
          </>
        }
        meta={
          <>
            <StatusDot tone={STATUS_TONE[station.status]} label={STATUS_LABEL[station.status]} />
            <Tag>{KIND_LABEL[station.kind]}</Tag>
            {showProvenance ? <ProvenanceChip meta={query.meta} /> : null}
          </>
        }
      />
      <FreshnessNote noun="station entry" meta={query.meta} dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} error={error} failureCount={query.failureCount} onRetry={refresh} />

      <div className={styles.grid}>
        <div className={styles.col}>
          <Plate index="Nº 0300" title="Survey image" flush>
            <StationThumb key={station.code} code={station.code} variant="hero" />
          </Plate>
          <Plate index="Nº 0301" title="Facts">
            <StationFacts station={station} />
          </Plate>
        </div>
        <div className={styles.col}>
          <Plate index="Fig. 1" title="Locator">
            <LocatorMap station={station} others={register.data?.items} />
          </Plate>
          <StationSignal key={station.code} code={station.code} />
        </div>
      </div>

      <StationDispatches key={station.code} code={station.code} />
    </>
  )
}
