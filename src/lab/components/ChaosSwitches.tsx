import type { ChaosState } from '@shared/contracts'
import { useUpdateChaos } from '@/lib/queries'
import { ErrorState, Plate, StatusDot, Switch } from '@/ui'
import styles from './ChaosSwitches.module.css'

interface SwitchDef {
  key: 'serverOffline' | 'schemaDrift'
  label: string
  description: string
  onSymptom: string
  offSymptom: string
}

const SWITCHES: readonly SwitchDef[] = [
  {
    key: 'serverOffline',
    label: 'Server offline',
    description: 'The socket of every request except /api/_lab is destroyed before any answer.',
    onSymptom: 'fetch() rejects with a TypeError, so apiFetch reports network (offline if the browser agrees). The telemetry strip flips to lie-fi within a probe interval, and the Network page shows requests with no request id.',
    offSymptom: 'When on: fetch() rejects, apiFetch reports network, and the strip shows lie-fi: online, but nothing answers.',
  },
  {
    key: 'schemaDrift',
    label: 'Schema drift',
    description: 'Dispatch payloads change shape: snake_case fields, a numeric level instead of severity. The envelope stays the same.',
    onSymptom: 'Requests succeed with HTTP 200 and then fail validation: schema-mismatch on the feed and on single dispatches. Stations, signal and the handbook still load. A cached feed from before the drift still parses, which is the trap.',
    offSymptom: 'When on: dispatch requests return 200 and are rejected by the zod contract as schema-mismatch. Everything else is untouched.',
  },
]

/** The two big levers. They act on the server at once (a PUT of the whole state, so flipping one twice is harmless). */
export function ChaosSwitches({ chaos }: { chaos: ChaosState }) {
  const update = useUpdateChaos()
  return (
    <Plate index="Nº 0702" title="Master switches" actions={update.isPending ? <span className={styles.saving}>Saving</span> : null}>
      {update.error ? (
        <div className={styles.error}>
          <ErrorState compact error={update.error} />
        </div>
      ) : null}
      <div className={styles.grid}>
        {SWITCHES.map((def) => {
          const on = chaos[def.key]
          return (
            <div key={def.key} className={styles.item} data-on={on || undefined}>
              <Switch label={def.label} description={def.description} checked={on} aria-busy={update.isPending || undefined} onChange={(checked) => !update.isPending && update.mutate({ ...chaos, [def.key]: checked })} />
              <p className={styles.live}>
                <StatusDot tone={on ? 'warn' : 'ok'} live={on} label={on ? 'Live: on' : 'Live: off'} />
              </p>
              <p className={styles.symptom}>
                <span className={styles.symptomLabel}>{on ? 'What you should be seeing' : 'Predicted symptom'}</span>
                {on ? def.onSymptom : def.offSymptom}
              </p>
            </div>
          )
        })}
      </div>
    </Plate>
  )
}
