import type { LabState } from '@shared/contracts'
import { useLabSetting } from '@/lib'
import { useLabState } from '@/lib/queries'
import { ErrorState, KeyValue, Plate, ProvenanceChip, Skeleton, Stat, StatGroup, StatusDot, TimeAgo } from '@/ui'
import styles from './LabHome.module.css'

export function describeChaos(chaos: LabState['chaos']): string {
  const parts = [
    chaos.serverOffline ? 'hard down' : null,
    chaos.schemaDrift ? 'schema drift' : null,
    ...chaos.rules.filter((r) => r.enabled).map((r) => r.label.toLowerCase()),
  ].filter((p): p is string => p !== null)
  return parts.length === 0 ? 'all clear' : parts.join(', ')
}

export function countChaos(chaos: LabState['chaos']): number {
  return Number(chaos.serverOffline) + Number(chaos.schemaDrift) + chaos.rules.filter((r) => r.enabled).length
}

function wireText(wire: LabState['wire']): string {
  const mode = wire.auto ? `auto, one dispatch every ${wire.everySec} s` : 'manual only'
  return wire.pushOnNew ? `${mode}, push on each` : mode
}

function Body({ state }: { state: LabState }) {
  const active = countChaos(state.chaos)
  return (
    <div className={styles.stack}>
      <StatGroup>
        <Stat label="Requests" value={state.counters.requests} />
        <Stat label="Faults injected" value={state.counters.chaosInjected} tone={state.counters.chaosInjected > 0 ? 'warn' : 'default'} />
        <Stat label="Dispatches" value={state.counters.dispatches} />
        <Stat label="Pushes sent" value={state.counters.pushSent} note={`${state.counters.subscriptions} subscribed`} />
        <Stat label="Sessions" value={state.counters.sessions} note={`TTL ${state.sessionTtlSec} s`} />
      </StatGroup>
      <KeyValue
        items={[
          { label: 'Server instance', value: state.serverInstance },
          { label: 'Up for', value: <TimeAgo at={state.startedAt} suffix="" /> },
          { label: 'Chaos', value: <StatusDot tone={active > 0 ? 'warn' : 'ok'} label={describeChaos(state.chaos)} /> },
          { label: 'Header profile', value: state.headerProfile },
          { label: 'Wire', value: wireText(state.wire) },
          { label: 'Release', value: `latest ${state.release.latestClient}, minimum ${state.release.minClient}, API ${state.release.api}` },
          { label: 'Handbook edition', value: state.release.handbookEdition },
        ]}
        columns={2}
      />
    </div>
  )
}

/** The relay's own switches and counters, polled from /api/_lab/state. The SSE feed keeps the log; this keeps the settings. */
export function ServerPlate() {
  const query = useLabState({ pollMs: 5000 })
  const showProvenance = useLabSetting('showProvenance')
  const { data, error, isFetching } = query

  return (
    <Plate index="Nº 0001" title="Relay state" actions={showProvenance ? <ProvenanceChip meta={query.meta} /> : null} aria-busy={isFetching && !data}>
      {data ? (
        <div className={styles.stack}>
          {error ? <ErrorState compact error={error} onRetry={() => void query.refetch()} retrying={isFetching} /> : null}
          <Body state={data} />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void query.refetch()} retrying={isFetching} />
      ) : (
        <div className={styles.stack} role="status" aria-label="Loading relay state">
          <Skeleton variant="block" height={88} />
          <Skeleton lines={4} />
        </div>
      )}
    </Plate>
  )
}
