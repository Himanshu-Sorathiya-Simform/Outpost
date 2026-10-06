import type { CSSProperties } from 'react'
import { cx } from './internal/cx'
import styles from './Meter.module.css'

export interface MeterProps {
  value: number
  min?: number
  max?: number
  /** Caption and accessible name. */
  label: string
  /** Number of ledger cells the bar is divided into. Default 20. */
  segments?: number
  tone?: 'ink' | 'accent' | 'ok' | 'warn' | 'error' | 'info'
  /** Text for the value readout and aria-valuetext ("42 of 120 MB"). Defaults to the percentage. */
  valueText?: string
  hideHeader?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/** Segmented bar, like a ledger rule cut into cells. role="meter" with a text equivalent. */
export function Meter({ value, min = 0, max = 100, label, segments = 20, tone = 'accent', valueText, hideHeader = false, size = 'md', className }: MeterProps) {
  const span = max - min || 1
  const ratio = Math.min(1, Math.max(0, (value - min) / span))
  const text = valueText ?? `${Math.round(ratio * 100)}%`
  return (
    <div className={cx(styles.meter, styles[tone], size === 'sm' && styles.sm, className)}>
      {hideHeader ? null : (
        <div className={styles.head}>
          <span className={styles.label}>{label}</span>
          <span className={styles.value}>{text}</span>
        </div>
      )}
      <div className={styles.track} role="meter" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={text}>
        <span className={styles.bar} style={{ '--segs': segments } as CSSProperties}>
          <span className={styles.fill} style={{ width: `${ratio * 100}%` }} />
        </span>
      </div>
    </div>
  )
}
