import { useMemo, useState } from 'react'
import { Button, Dialog, Plate, Segmented } from '@/ui'
import { ErrorsRenderBox } from './ErrorsRenderBox'
import { useScenarioRunner } from './ErrorsRunner'
import { SCENARIOS } from './ErrorsScenarios'
import type { Scenario, ScenarioAction } from './ErrorsScenarioTypes'
import { ErrorsTile } from './ErrorsTile'
import styles from './ErrorsSimulator.module.css'

type Filter = 'all' | 'real' | 'synthetic'

interface Pending {
  scenario: Scenario
  action: ScenarioAction
}

const REAL_COUNT = SCENARIOS.filter((s) => s.real).length

/** Every AppErrorKind as a tile you can press. Real tiles go through the app's own layers; synthetic ones hand a built error to the centre. */
export function ErrorsSimulator() {
  const runner = useScenarioRunner()
  const [filter, setFilter] = useState<Filter>('all')
  const [pending, setPending] = useState<Pending | null>(null)

  const visible = useMemo(() => SCENARIOS.filter((s) => filter === 'all' || (filter === 'real') === s.real), [filter])

  const request = (scenario: Scenario, action: ScenarioAction): void => {
    if (action.confirm) setPending({ scenario, action })
    else void runner.run(scenario, action)
  }

  const confirm = (): void => {
    if (!pending) return
    const { scenario, action } = pending
    setPending(null)
    void runner.run(scenario, action)
  }

  return (
    <Plate
      index={2}
      title="Error simulator"
      actions={
        <Segmented
          size="sm"
          label="Show scenarios"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All ${SCENARIOS.length}` },
            { value: 'real', label: `Real ${REAL_COUNT}` },
            { value: 'synthetic', label: `Synthetic ${SCENARIOS.length - REAL_COUNT}` },
          ]}
        />
      }
    >
      <div className={styles.body}>
        <p className={styles.lede}>
          <strong>Real</strong> tiles provoke the failure with a genuine mechanism and let it travel through the app's own layers, so what lands in the centre above is what a user would have produced.{' '}
          <strong>Synthetic</strong> tiles construct the exception because the real trigger is a browser fault or a service worker that does not exist yet. Each tile says which it is and how.
        </p>
        <ErrorsRenderBox armed={runner.crashed} onReset={runner.resetCrash} />
        <ul className={styles.grid} aria-label="Error scenarios">
          {visible.map((scenario) => (
            <ErrorsTile key={scenario.kind} scenario={scenario} result={runner.results[scenario.kind]} running={runner.running} onRun={request} />
          ))}
        </ul>
      </div>
      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.action.confirm?.title ?? ''}
        footer={
          <>
            <Button onClick={() => setPending(null)} data-autofocus>
              Cancel
            </Button>
            <Button variant="danger" icon="play" onClick={confirm}>
              {pending?.action.confirm?.label}
            </Button>
          </>
        }
      >
        <p className={styles.confirm}>{pending?.action.confirm?.body}</p>
      </Dialog>
    </Plate>
  )
}
