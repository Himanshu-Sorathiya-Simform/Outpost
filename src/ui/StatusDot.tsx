import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './internal/cx'
import styles from './StatusDot.module.css'

/**
 * One distinct shape per state, so colour is never the only signal:
 *   ok = square   warn = diamond   error = triangle   info = disc   idle = ring
 * Station statuses map as online -> ok, degraded -> warn, dark -> error.
 */
export type StatusTone = 'ok' | 'warn' | 'error' | 'info' | 'idle'

export interface StatusDotProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  tone: StatusTone
  /** Visible text next to the dot. Without it, pass `title` so the dot has an accessible name. */
  label?: ReactNode
  /** Stepped blink for something that is live right now. */
  live?: boolean
  size?: 'sm' | 'md'
}

export function StatusDot({ tone, label, live = false, size = 'md', title, className, ...rest }: StatusDotProps) {
  const named = label === undefined && title !== undefined
  return (
    <span className={cx(styles.wrap, styles[size], className)} role={named ? 'img' : undefined} aria-label={named ? title : undefined} {...rest}>
      <span className={cx(styles.dot, styles[tone], live && styles.live)} aria-hidden="true" />
      {label !== undefined ? <span className={styles.label}>{label}</span> : null}
    </span>
  )
}
