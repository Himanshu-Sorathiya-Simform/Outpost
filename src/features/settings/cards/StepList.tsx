import { Icon, cx, type IconName } from '@/ui'
import styles from './StepList.module.css'

export interface Step {
  label: string
  status: 'pending' | 'running' | 'ok' | 'unwired' | 'denied' | 'failed' | 'skipped'
  detail?: string
}

const GLYPH: Record<Step['status'], { icon: IconName; text: string }> = {
  pending: { icon: 'minus', text: 'Waiting' },
  running: { icon: 'hourglass', text: 'Working' },
  ok: { icon: 'check', text: 'Done' },
  unwired: { icon: 'info', text: 'Not wired' },
  denied: { icon: 'lock', text: 'Refused' },
  failed: { icon: 'warning', text: 'Failed' },
  skipped: { icon: 'minus', text: 'Skipped' },
}

/** A short numbered run of steps with each one's outcome in words and shape. Announces as it changes. */
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className={styles.list} aria-live="polite" aria-label="Steps">
      {steps.map((step, i) => (
        <li key={step.label} className={cx(styles.step, styles[step.status])}>
          <span className={styles.num}>{i + 1}</span>
          <span className={styles.body}>
            <span className={styles.label}>{step.label}</span>
            {step.detail ? <span className={styles.detail}>{step.detail}</span> : null}
          </span>
          <span className={styles.status}>
            <Icon name={GLYPH[step.status].icon} size={14} />
            {GLYPH[step.status].text}
          </span>
        </li>
      ))}
    </ol>
  )
}
