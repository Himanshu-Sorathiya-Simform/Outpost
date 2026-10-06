import { Field, Input } from '@/ui'
import type { PushAction } from './ServerPushDraft'
import styles from './ServerPushForm.module.css'

/** Two optional notification buttons: an id the worker sees in event.action, and the label on the button. */
export function ServerPushActions({ actions, onChange }: { actions: PushAction[]; onChange: (actions: PushAction[]) => void }) {
  const slot = (i: number): PushAction => actions[i] ?? { action: '', title: '' }
  const change = (i: number, patch: Partial<PushAction>): void => {
    const next = [slot(0), slot(1)]
    next[i] = { ...slot(i), ...patch }
    onChange(next)
  }
  return (
    <fieldset className={styles.actions}>
      <legend className={styles.heading}>Actions (at most two)</legend>
      {[0, 1].map((i) => (
        <div key={i} className={styles.pair}>
          <Field label={`Action ${i + 1} id`}>
            <Input value={slot(i).action} onChange={(e) => change(i, { action: e.target.value })} spellCheck={false} autoComplete="off" placeholder={i === 0 ? 'open' : 'ack'} />
          </Field>
          <Field label={`Action ${i + 1} label`}>
            <Input value={slot(i).title} onChange={(e) => change(i, { title: e.target.value })} autoComplete="off" placeholder={i === 0 ? 'Open' : 'Acknowledge'} />
          </Field>
        </div>
      ))}
    </fieldset>
  )
}
