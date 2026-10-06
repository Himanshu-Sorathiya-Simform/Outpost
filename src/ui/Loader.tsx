import type { CSSProperties } from 'react'
import { cx } from './internal/cx'
import styles from './Loader.module.css'

export interface LoaderProps {
  /** Visible caption. Defaults to "Receiving"; pass `null` for bars only (an sr-only label is kept). */
  label?: string | null
  size?: 'sm' | 'md' | 'lg'
  /** Inside another control that already carries the busy state: no role, no live announcement. */
  decorative?: boolean
  className?: string
}

/** Four signal bars that light up in a chase, stepped rather than eased. */
export function Loader({ label = 'Receiving', size = 'md', decorative = false, className }: LoaderProps) {
  return (
    <span className={cx(styles.loader, styles[size], decorative && styles.decorative, className)} role={decorative ? undefined : 'status'} aria-hidden={decorative || undefined}>
      <span className={styles.bars} aria-hidden="true">
        <i style={{ '--i': 0 } as CSSProperties} />
        <i style={{ '--i': 1 } as CSSProperties} />
        <i style={{ '--i': 2 } as CSSProperties} />
        <i style={{ '--i': 3 } as CSSProperties} />
      </span>
      {label === null ? <span className="sr-only">Loading</span> : <span className={styles.text}>{label}</span>}
    </span>
  )
}
