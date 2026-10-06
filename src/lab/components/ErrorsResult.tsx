import { Icon, TimeAgo } from '@/ui'
import { ErrorsKindStamp } from './ErrorsKindStamp'
import type { RunResult, Scenario } from './ErrorsScenarioTypes'
import styles from './ErrorsResult.module.css'

/** What one run produced: what the caller saw, then what the centre received. Announced politely when it arrives. */
export function ErrorsResult({ scenario, result }: { scenario: Scenario; result: RunResult | undefined }) {
  if (!result) return <div className={styles.result} aria-live="polite" />
  const { caught, landed, note } = result
  const surprise = caught !== null && caught !== scenario.kind
  return (
    <div className={styles.result} aria-live="polite">
      <p className={styles.line}>
        <span className={styles.key}>Caller saw</span>
        {caught ? <ErrorsKindStamp kind={caught} size="sm" /> : <span className={styles.none}>no error</span>}
        <TimeAgo at={result.at} className={styles.when} />
      </p>
      {surprise ? (
        <p className={styles.surprise}>
          <Icon name="warning" size={14} /> Expected {scenario.kind}. Something else got there first. The row in the centre says what.
        </p>
      ) : null}
      {note ? <p className={styles.note}>{note}</p> : null}
      <div className={styles.line}>
        <span className={styles.key}>In the centre</span>
        {landed.length === 0 ? (
          <span className={styles.none}>{surprise ? 'nothing: the failure came from the simulator\'s own setup call, before the request under test' : (scenario.quietReason ?? 'nothing was filed')}</span>
        ) : (
          <ul className={styles.landed}>
            {landed.map((row) => (
              <li key={row.id} className={styles.row}>
                <ErrorsKindStamp kind={row.kind} size="sm" />
                <span className={styles.source}>{row.source ?? 'no source'}</span>
                {row.count > 1 ? <span className={styles.count}>x{row.count}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
