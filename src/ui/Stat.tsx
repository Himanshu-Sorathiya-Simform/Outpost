import type { ReactNode } from 'react'
import { Sparkline } from './Sparkline'
import { cx } from './internal/cx'
import styles from './Stat.module.css'

export interface StatProps {
  label: string
  value: ReactNode
  unit?: string
  /** Line under the value: "+3 since 06:00", "of 148". */
  note?: ReactNode
  tone?: 'default' | 'ok' | 'warn' | 'error' | 'accent'
  /** Samples for an inline trend. */
  trend?: number[]
  size?: 'md' | 'lg'
  className?: string
}

/** A figure with a caption: big display numerals, small mono label. */
export function Stat({ label, value, unit, note, tone = 'default', trend, size = 'md', className }: StatProps) {
  return (
    <div className={cx(styles.stat, styles[tone], size === 'lg' && styles.lg, className)}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.body}>
        <span className={styles.value}>
          {value}
          {unit ? <span className={styles.unit}>{unit}</span> : null}
        </span>
      </dd>
      {trend && trend.length > 1 ? (
        <dd className={styles.trendRow}>
          <Sparkline values={trend} width={96} height={26} label={`${label} trend`} className={styles.trend} />
        </dd>
      ) : null}
      {note ? <dd className={styles.note}>{note}</dd> : null}
    </div>
  )
}

/** Lays several Stats out as a ruled strip. Renders a <dl>. */
export function StatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cx(styles.group, className)}>{children}</dl>
}
