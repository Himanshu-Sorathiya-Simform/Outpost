import type { BenchStrategy } from '@shared/contracts'
import { Button, Sparkline, TBody, THead, Table, Td, Th, Tr, formatClock, formatDuration } from '@/ui'
import { ErrorStamp, SourceCell, VerdictTag } from './BenchBadges'
import { readingRev } from './BenchRun'
import type { BenchReading } from './BenchStore'
import { STRATEGY_NAME } from './BenchStrategies'
import styles from './BenchHistory.module.css'

function deltaText(delta: number | null): string {
  if (delta === null) return '-'
  return delta > 0 ? `+${delta}` : String(delta)
}

/** The five (or fewer) readings of the newest "Fetch x5", oldest first, one line each. */
function BatchStrip({ batch }: { batch: BenchReading[] }) {
  return (
    <ol className={styles.batch} aria-label="Last batch, in order">
      {batch.map((r, i) => (
        <li key={r.id} className={styles.call}>
          <span className={styles.callNo}>{i + 1}</span>
          {r.outcome.ok ? (
            <>
              <span>rev {r.outcome.data.rev}</span>
              <SourceCell source={r.outcome.meta.source} />
              <span>{formatDuration(r.durationMs)}</span>
            </>
          ) : (
            <ErrorStamp error={r.outcome.error} />
          )}
        </li>
      ))}
    </ol>
  )
}

interface Props {
  strategy: BenchStrategy
  /** Newest first. */
  readings: BenchReading[]
  onClear: () => void
}

/** Last fifteen fetches of one card, with a latency trend and the hits column that says whether the server was involved. */
export function BenchHistory({ strategy, readings, onClear }: Props) {
  if (readings.length === 0) return null
  const latest = readings[0]
  const batchId = latest ? latest.batch : null
  const batch = batchId !== null ? readings.filter((r) => r.batch === batchId).reverse() : []
  const chronological = [...readings].reverse()

  return (
    <div className={styles.history}>
      {batch.length > 1 ? (
        <div className={styles.block}>
          <p className={styles.heading}>Last batch</p>
          <BatchStrip batch={batch} />
        </div>
      ) : null}
      <div className={styles.trend}>
        <Sparkline values={chronological.map((r) => r.durationMs)} width={160} height={28} label={`${STRATEGY_NAME[strategy]} latency in ms`} />
        <span className={styles.trendNote}>latency, oldest to newest</span>
        <Button size="sm" variant="quiet" onClick={onClear}>
          Clear history
        </Button>
      </div>
      <Table caption={`${STRATEGY_NAME[strategy]}: ${readings.length === 1 ? 'the last fetch' : `last ${readings.length} fetches`} (15 kept)`} dense minWidth={520}>
        <THead>
          <Tr>
            <Th>Time</Th>
            <Th>Key</Th>
            <Th numeric>Rev</Th>
            <Th numeric>Hits</Th>
            <Th numeric>Hits +</Th>
            <Th>Source</Th>
            <Th numeric>Took</Th>
            <Th>Verdict</Th>
          </Tr>
        </THead>
        <TBody>
          {readings.map((r) => {
            const rev = readingRev(r)
            return (
              <Tr key={r.id} flag={!r.outcome.ok ? 'error' : r.verdict.kind === 'fresh' ? 'ok' : r.verdict.kind === 'stale' ? 'warn' : undefined}>
                <Td mono nowrap>
                  {formatClock(r.startedAt)}
                </Td>
                <Td mono nowrap>
                  {r.key}
                </Td>
                <Td numeric>{rev ?? '-'}</Td>
                <Td numeric>{r.outcome.ok ? r.outcome.data.hits : '-'}</Td>
                <Td numeric title={r.hitsDelta === 0 ? 'Hits did not move: answered without the server' : undefined}>
                  {deltaText(r.hitsDelta)}
                </Td>
                <Td>{r.outcome.ok ? <SourceCell source={r.outcome.meta.source} /> : <ErrorStamp error={r.outcome.error} />}</Td>
                <Td numeric nowrap>
                  {formatDuration(r.durationMs)}
                </Td>
                <Td>{r.outcome.ok ? <VerdictTag verdict={r.verdict} /> : <span className={styles.none}>no data</span>}</Td>
              </Tr>
            )
          })}
        </TBody>
      </Table>
      <p className={styles.legend}>
        <strong>Hits +</strong> is how far the server&apos;s own counter moved since the previous reading of the same key. A <strong>0</strong> means the hits did not move: the answer
        came without the server. Verdicts are as of the fetch; the panel above keeps judging.
      </p>
    </div>
  )
}
