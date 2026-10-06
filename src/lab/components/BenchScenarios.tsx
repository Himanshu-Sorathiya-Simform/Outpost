import { useQueryClient } from '@tanstack/react-query'
import { BENCH_STRATEGIES } from '@shared/contracts'
import { Button, ErrorState, LinkButton, Plate, TBody, THead, Table, Tag, Td, Th, Tr, formatDuration } from '@/ui'
import { ErrorStamp, SourceCell, VerdictTag } from './BenchBadges'
import { runScenario, useBenchExperiments, useBenchLocked } from './BenchExperiments'
import { SCENARIOS, matchesExpectation, type ScenarioDef } from './BenchScenarioDefs'
import { useCurrentReading } from './BenchStore'
import { STRATEGY_NAME } from './BenchStrategies'
import styles from './BenchScenarios.module.css'

function Report({ def }: { def: ScenarioDef }) {
  const scenario = useBenchExperiments((s) => s.scenario)
  const current = useCurrentReading()
  const readings = BENCH_STRATEGIES.flatMap((s) => {
    const reading = current(scenario.results[s])
    return reading ? [{ strategy: s, reading }] : []
  })
  const everyOkFromNetwork = readings.length > 0 && readings.every(({ reading }) => !reading.outcome.ok || reading.outcome.meta.source === 'network')
  const differs = readings.filter(({ strategy, reading }) => !matchesExpectation(def.expect[strategy], reading)).length

  return (
    <div className={styles.report}>
      <h3 className={styles.reportTitle}>
        {def.title} <span className={styles.on}>on {scenario.key}</span>
      </h3>
      <ol className={styles.steps} aria-live="polite" aria-label="Progress">
        {scenario.log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>

      {scenario.failure ? <ErrorState compact error={scenario.failure} /> : null}
      {scenario.chaosFailure ? (
        <ErrorState
          error={scenario.chaosFailure}
          actions={
            <LinkButton to="/lab/chaos" size="sm">
              Open Chaos
            </LinkButton>
          }
        />
      ) : null}

      {readings.length > 0 ? (
        <Table caption="Expected with a correct worker, against what happened" dense minWidth={640}>
          <THead>
            <Tr>
              <Th>Strategy</Th>
              <Th>Expected</Th>
              <Th>Happened</Th>
              <Th>Match</Th>
            </Tr>
          </THead>
          <TBody>
            {readings.map(({ strategy, reading }) => {
              const expect = def.expect[strategy]
              const match = matchesExpectation(expect, reading)
              return (
                <Tr key={strategy} flag={match ? 'ok' : 'warn'}>
                  <Td nowrap>{STRATEGY_NAME[strategy]}</Td>
                  <Td>{expect.text}</Td>
                  <Td>
                    {reading.outcome.ok ? (
                      <span className={styles.happened}>
                        <VerdictTag verdict={reading.verdict} />
                        <span>rev {reading.outcome.data.rev}</span>
                        <SourceCell source={reading.outcome.meta.source} />
                        <span>{formatDuration(reading.durationMs)}</span>
                      </span>
                    ) : (
                      <span className={styles.happened}>
                        <ErrorStamp error={reading.outcome.error} />
                        <span>{formatDuration(reading.durationMs)}</span>
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Tag tone={match ? 'ok' : 'warn'} icon={match ? 'check' : 'warning'}>
                      {match ? 'As expected' : 'Differs'}
                    </Tag>
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
      ) : null}

      <p className={styles.verdictLine} role="status">
        {scenario.status === 'running' ? 'Running.' : null}
        {scenario.status !== 'running' && readings.length > 0
          ? `${readings.length - differs} of ${readings.length} as a correct worker would give.${everyOkFromNetwork ? ' Every answer came from the network: nothing is caching these routes yet.' : ''}`
          : null}
        {scenario.chaos === 'restored' ? ' Chaos is cleared.' : null}
      </p>
    </div>
  )
}

/** Guided experiments. Each one says what it will do first, and any that break the relay put it back before reporting. */
export function BenchScenarios({ runKey }: { runKey: string }) {
  const qc = useQueryClient()
  const locked = useBenchLocked()
  const scenario = useBenchExperiments((s) => s.scenario)
  const shown = SCENARIOS.find((s) => s.id === scenario.id)

  return (
    <Plate index={401} title="Scenarios">
      <div className={styles.stack}>
        <ul className={styles.list}>
          {SCENARIOS.map((def) => (
            <li key={def.id} className={styles.item}>
              <div className={styles.text}>
                <p className={styles.name}>{def.title}</p>
                <p className={styles.summary}>{def.summary}</p>
              </div>
              <Button size="sm" icon="play" loading={scenario.status === 'running' && scenario.id === def.id} disabled={locked && scenario.id !== def.id} onClick={() => void runScenario(qc, def.id, runKey)}>
                Run on {def.fixedKey ?? runKey}
              </Button>
            </li>
          ))}
        </ul>
        {shown ? <Report def={shown} /> : null}
      </div>
    </Plate>
  )
}
