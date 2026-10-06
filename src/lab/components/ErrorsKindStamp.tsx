import type { AppErrorKind } from '@/lib'
import { cx } from '@/ui'
import { kindTone } from './ErrorsKinds'
import styles from './ErrorsKindStamp.module.css'

export interface ErrorsKindStampProps {
  kind: AppErrorKind
  /** Occurrences, printed after the name. */
  count?: number
  /** Turns the stamp into a toggle button (aria-pressed). */
  pressed?: boolean
  onPress?: () => void
  size?: 'sm' | 'md'
  className?: string
}

/**
 * An error kind as a rubber stamp. The border style carries the loudness on top of colour:
 * hairline for expected states, solid for transient trouble, double for faults.
 */
export function ErrorsKindStamp({ kind, count, pressed, onPress, size = 'md', className }: ErrorsKindStampProps) {
  const cls = cx(styles.stamp, styles[kindTone(kind)], size === 'sm' && styles.sm, onPress && styles.button, pressed && styles.on, className)
  const inner = (
    <>
      {kind}
      {count !== undefined ? <span className={styles.count}>{count}</span> : null}
    </>
  )
  if (onPress) {
    return (
      <button type="button" className={cls} aria-pressed={pressed} onClick={onPress}>
        {inner}
      </button>
    )
  }
  return <span className={cls}>{inner}</span>
}
