import { useQueryClient } from '@tanstack/react-query'
import { BENCH_KEYS, BENCH_STRATEGIES } from '@shared/contracts'
import { Button, EmptyState, Plate, Segmented, TBody, THead, Table, Td, Th, Tr, formatDuration, type SegmentedOption } from '@/ui'
import { ErrorStamp, SeenTag, SourceCell, VerdictTag } from './BenchBadges'
import { runRace, useBenchExperiments, useBenchLocked } from './BenchExperiments'
import { useCurrentReading } from './BenchStore'
import { STRATEGY_NAME } from './BenchStrategies'
import styles from './BenchRace.module.css'

const KEY_OPTIONS: SegmentedOption<string>[] = BENCH_KEYS.map((k) => ({ value: k, label: k }))

interface Props {
  runKey: string
  onRunKey: (key: string) => void
}

/** The same key through all five strategies, one after another, laid out as a ledger you can read across. */
export function BenchRace({ runKey, onRunKey }: Props) {
  const qc = useQueryClient()
  const race = useBenchExperiments((s) => s.race)
  const locked = useBenchLocked()
  const current = useCurrentReading()

  const rows = BENCH_STRATEGIES.map((strategy) => ({ strategy, reading: current(race.rows[strategy]) }))
  const slowest = Math.max(1, ...rows.map((r) => r.reading?.durationMs ?? 0))
  const settled = rows.flatMap((r) => (r.reading ? [r.reading] : []))
  const fresh = settled.filter((r) => r.outcome.ok && r.verdict.kind === 'fresh').length
  const stale = settled.filter((r) => r.outcome.ok && r.verdict.kind === 'stale').length
  const failed = settled.filter((r) => !r.outcome.ok).length

  return (
    <Plate
      index={400}
      title="One key, five strategies"
      actions={
        <Button variant="primary" size="sm" icon="play" loading={race.status === 'running'} disabled={locked && race.status !== 'running'} onClick={() => void runRace(qc, runKey)}>
          Run all five
        </Button>
      }
    >
      <div className={styles.stack}>
        <div className={styles.key}>
          <Segmented label="Key for the run and the scenarios" options={KEY_OPTIONS} value={runKey} onChange={onRunKey} size="sm" showLabel />
          <p className={styles.note}>The same key goes to each strategy in turn, so any difference in the ledger is the strategy&apos;s doing.</p>
        </div>

        {race.status === 'idle' ? (
          <EmptyState compact icon="hourglass" title="Nothing run yet">
            The ledger fills in one row per strategy: how long it took, which revision it gave back, where it came from, and whether the server agrees.
          </EmptyState>
        ) : (
          <Table caption={`Five strategies on ${race.key ?? runKey}`} dense minWidth={620}>
            <THead>
              <Tr>
                <Th>Strategy</Th>
                <Th>Latency</Th>
                <Th numeric>Rev</Th>
                <Th>Source</Th>
                <Th>Verdict</Th>
                <Th>Server log</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map(({ strategy, reading }) => (
                <Tr key={strategy}>
                  <Td nowrap>{STRATEGY_NAME[strategy]}</Td>
                  <Td>
                    {reading ? (
                      <span className={styles.latency}>
                        <span className={styles.track} aria-hidden="true">
                          <span className={styles.bar} style={{ width: `${Math.max(2, (reading.durationMs / slowest) * 100)}%` }} />
                        </span>
                        <span className={styles.ms}>{formatDuration(reading.durationMs)}</span>
                      </span>
                    ) : (
                      <span className={styles.wait}>{race.current === strategy ? 'running' : 'waiting'}</span>
                    )}
                  </Td>
                  <Td numeric>{reading?.outcome.ok ? reading.outcome.data.rev : '-'}</Td>
                  <Td>{reading ? reading.outcome.ok ? <SourceCell source={reading.outcome.meta.source} /> : <ErrorStamp error={reading.outcome.error} /> : null}</Td>
                  <Td>{reading?.outcome.ok ? <VerdictTag verdict={reading.verdict} /> : null}</Td>
                  <Td>{reading ? <SeenTag seen={reading.seen} status={reading.seenStatus} /> : null}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        <p className={styles.summary} role="status">
          {race.status === 'running' ? `Running ${race.current ? STRATEGY_NAME[race.current] : ''}.` : null}
          {race.status === 'done' ? `Done on ${race.key ?? runKey}: ${fresh} fresh, ${stale} stale, ${failed} failed.` : null}
        </p>
      </div>
    </Plate>
  )
}
