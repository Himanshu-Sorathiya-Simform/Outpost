import type { SignalBoard } from '@shared/contracts'
import { cx, formatClock } from '@/ui'
import { STALE_AFTER_MS, sampleAgeText } from './signal'
import styles from './BoardFigures.module.css'

export interface BoardFiguresProps {
  board: SignalBoard
  /** Client clock, ms. */
  now: number
  pollingLabel: string
}

interface Figure {
  label: string
  value: string
  note: string
  warn?: boolean
}

/** The header figures: sequence, when the relay sampled, how old that is right now, and what is reporting. */
export function BoardFigures({ board, now, pollingLabel }: BoardFiguresProps) {
  const sampled = Date.parse(board.sampledAt)
  const age = now === 0 || Number.isNaN(sampled) ? null : now - sampled
  const dark = board.readings.filter((r) => r.status === 'dark').length
  const figures: Figure[] = [
    { label: 'Sequence', value: `Nº ${board.seq}`, note: 'Counts every answer the relay gives' },
    { label: 'Sampled at', value: formatClock(board.sampledAt), note: 'Relay clock' },
    { label: 'Sample age', value: age === null ? '-' : sampleAgeText(age), note: "Against this device's clock", warn: age !== null && age > STALE_AFTER_MS },
    { label: 'Reporting', value: `${board.readings.length - dark} of ${board.readings.length}`, note: dark > 0 ? `${dark} dark` : 'All stations', warn: dark > 0 },
    { label: 'Polling', value: pollingLabel, note: 'Stops when the tab is hidden' },
  ]
  return (
    <dl className={styles.strip}>
      {figures.map((f) => (
        <div key={f.label} className={cx(styles.cell, f.warn && styles.warn)}>
          <dt className={styles.label}>{f.label}</dt>
          <dd className={styles.value}>{f.value}</dd>
          <dd className={styles.note}>{f.note}</dd>
        </div>
      ))}
    </dl>
  )
}
