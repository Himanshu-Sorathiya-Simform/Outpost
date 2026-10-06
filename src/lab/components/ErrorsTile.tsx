import { Button, Icon, Tag } from '@/ui'
import { ErrorsKindStamp } from './ErrorsKindStamp'
import { ErrorsResult } from './ErrorsResult'
import type { RunResult, Scenario, ScenarioAction } from './ErrorsScenarioTypes'
import styles from './ErrorsTile.module.css'

export interface ErrorsTileProps {
  scenario: Scenario
  result: RunResult | undefined
  /** `kind:actionId` of whatever is running anywhere on the page. */
  running: string | null
  onRun: (scenario: Scenario, action: ScenarioAction) => void
}

/** One error kind: how it is provoked, whether that is genuine, the buttons, and the outcome of the last run. */
export function ErrorsTile({ scenario, result, running, onRun }: ErrorsTileProps) {
  const busy = running !== null
  return (
    <li className={styles.tile} data-real={scenario.real || undefined}>
      <div className={styles.head}>
        <ErrorsKindStamp kind={scenario.kind} />
        <Tag tone={scenario.real ? 'ok' : 'neutral'} icon={scenario.real ? 'check' : 'pen'} title={scenario.real ? 'Provoked by a genuine mechanism' : 'Constructed by hand'}>
          {scenario.real ? 'Real' : 'Synthetic'}
        </Tag>
      </div>
      <p className={styles.how}>{scenario.how}</p>
      {scenario.caution ? (
        <p className={styles.caution}>
          <Icon name="warning" size={14} />
          <span>{scenario.caution}</span>
        </p>
      ) : null}
      <div className={styles.actions}>
        {scenario.actions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            variant={action.always ? 'quiet' : 'ghost'}
            icon={action.always ? 'arrow-left' : 'play'}
            loading={running === `${scenario.kind}:${action.id}`}
            disabled={busy && !action.always && running !== `${scenario.kind}:${action.id}`}
            onClick={() => onRun(scenario, action)}
          >
            {action.label}
          </Button>
        ))}
      </div>
      <ErrorsResult scenario={scenario} result={result} />
    </li>
  )
}
