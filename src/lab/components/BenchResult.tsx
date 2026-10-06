import type { LabTruth } from '@shared/contracts'
import { EmptyState, KeyValue, Loader, ProvenanceChip, TimeAgo, formatClock, formatDuration } from '@/ui'
import { ErrorStamp, SeenTag, SourceCell, VerdictTag } from './BenchBadges'
import { judge, readingRev, truthRevOf } from './BenchRun'
import type { BenchReading } from './BenchStore'
import styles from './BenchResult.module.css'

interface Props {
  reading: BenchReading | undefined
  truth: LabTruth | undefined
  busy: boolean
  showProvenance: boolean
}

/** The newest reading of one card: what came back, where from, and whether it is true. */
export function BenchResult({ reading, truth, busy, showProvenance }: Props) {
  if (!reading) {
    return busy ? (
      <div className={styles.wait} role="status">
        <Loader label="Taking a reading" />
      </div>
    ) : (
      <EmptyState compact icon="hourglass" title="No reading yet">
        Fetch takes one. The verdict compares it with what the server holds at that moment.
      </EmptyState>
    )
  }

  const rev = readingRev(reading)
  const serverRev = truthRevOf(truth, reading.strategy, reading.key)
  // The stored verdict is the one at fetch time; this one moves when the server does (after a bump, say).
  const live = truth ? judge(rev, serverRev) : reading.verdict
  const moved = live.kind !== reading.verdict.kind || (live.kind === 'stale' && reading.verdict.kind === 'stale' && live.by !== reading.verdict.by)

  const common = [
    {
      label: 'Verdict',
      value: (
        <span className={styles.verdict}>
          <VerdictTag verdict={live} />
          {moved ? <span className={styles.was}>was {reading.verdict.kind === 'stale' ? `stale by ${reading.verdict.by}` : reading.verdict.kind} when taken</span> : null}
        </span>
      ),
    },
    { label: 'Server log', value: <SeenTag seen={reading.seen} status={reading.seenStatus} /> },
  ]

  return (
    <div className={styles.result} aria-busy={busy} aria-live="polite">
      {reading.outcome.ok ? (
        <>
          <KeyValue
            dense
            columns={2}
            items={[
              ...common,
              { label: 'Rev', value: serverRev !== null && serverRev !== rev ? `${String(rev)} (server ${String(serverRev)})` : String(rev) },
              { label: 'Server hits', value: String(reading.outcome.data.hits) },
              { label: 'Served at', value: formatClock(reading.outcome.data.servedAt, true) },
              { label: 'Instance', value: reading.outcome.data.serverInstance },
              { label: 'Request id', value: reading.outcome.data.requestId },
              { label: 'Took', value: formatDuration(reading.durationMs) },
              { label: 'Source', value: <SourceCell source={reading.outcome.meta.source} /> },
              { label: 'Sample', value: String(reading.outcome.data.payload.sample) },
            ]}
          />
          <div className={styles.foot}>
            {showProvenance ? <ProvenanceChip meta={reading.outcome.meta} /> : null}
            <span className={styles.ago}>
              taken <TimeAgo at={reading.endedAt} />
            </span>
          </div>
        </>
      ) : (
        <>
          <div className={styles.error}>
            <ErrorStamp error={reading.outcome.error} />
            <p className={styles.message}>{reading.outcome.error.userMessage}</p>
          </div>
          <KeyValue
            dense
            columns={2}
            items={[
              ...common,
              { label: 'Took', value: formatDuration(reading.durationMs) },
              { label: 'Status', value: reading.outcome.error.context.status === undefined ? 'no response' : String(reading.outcome.error.context.status) },
              { label: 'Request id', value: reading.outcome.error.context.requestId ?? 'none' },
              { label: 'Injected by', value: reading.outcome.error.context.chaos, show: reading.outcome.error.context.chaos !== undefined },
            ]}
          />
          <p className={styles.ago}>
            taken <TimeAgo at={reading.endedAt} />
          </p>
        </>
      )}
    </div>
  )
}
