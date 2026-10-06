import type { HTMLAttributes } from 'react'
import type { Severity } from '@shared/contracts'
import { cx } from './internal/cx'
import styles from './SeverityStamp.module.css'

const LEVEL: Record<Severity, number> = { routine: 1, notice: 2, urgent: 3, critical: 4 }

export interface SeverityStampProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  severity: Severity
  size?: 'sm' | 'md' | 'lg'
  /** Keep the stamp level. Rotation is part of the look; turn it off inside dense tables. */
  flat?: boolean
}

/**
 * Severity as a rubber stamp. The word is always printed; on top of colour, each level has its
 * own border (thin, solid, double, inverted slab) and a 1-4 step level gauge.
 */
export function SeverityStamp({ severity, size = 'md', flat = false, className, ...rest }: SeverityStampProps) {
  return (
    <span className={cx(styles.stamp, styles[severity], styles[size], flat && styles.flat, className)} {...rest}>
      <span className={styles.gauge} aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <i key={n} data-on={n <= LEVEL[severity] ? '' : undefined} />
        ))}
      </span>
      {severity}
    </span>
  )
}
