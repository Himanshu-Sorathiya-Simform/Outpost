import { cx } from '@/ui'
import styles from './ChangedStamp.module.css'

export interface ChangedStampProps {
  reasons: readonly string[]
  className?: string
}

/** The rubber stamp for a row whose data moved since the previous response. It fades out in steps; the reason stays in the text. */
export function ChangedStamp({ reasons, className }: ChangedStampProps) {
  return (
    <span className={cx(styles.wrap, className)}>
      <span className={styles.stamp}>Changed</span>
      <span className={styles.reason}>{reasons.join(', ')}</span>
    </span>
  )
}
