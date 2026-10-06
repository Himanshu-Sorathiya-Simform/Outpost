import type { CSSProperties } from 'react'
import { cx } from './internal/cx'
import styles from './Skeleton.module.css'

export interface SkeletonProps {
  /** `line` is a text row, `title` a display-size row, `block` a free rectangle (set height). */
  variant?: 'line' | 'title' | 'block'
  width?: number | string
  height?: number | string
  /** Number of line rows; the last one is shorter. */
  lines?: number
  className?: string
}

/**
 * Loading placeholder: hatched paper that crawls in coarse steps. No shimmer, no gradient.
 * Decorative; pair it with a Loader or a labelled region if the wait needs announcing.
 */
export function Skeleton({ variant = 'line', width, height, lines = 1, className }: SkeletonProps) {
  const rows = variant === 'block' ? 1 : Math.max(1, lines)
  return (
    <span className={cx(styles.group, className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => {
        const style: CSSProperties = { width: width ?? (rows > 1 && i === rows - 1 ? '62%' : '100%'), height }
        return <span key={i} className={cx(styles.bar, styles[variant])} style={style} />
      })}
    </span>
  )
}
