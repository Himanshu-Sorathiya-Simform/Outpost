import type { HTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { cx } from './internal/cx'
import styles from './Tag.module.css'

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'error' | 'info'

export interface TagProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  tone?: Tone
  /** Solid fill instead of an outline. */
  solid?: boolean
  icon?: IconName
  /** Renders a remove button. `removeLabel` is its accessible name (e.g. "Remove filter: KRN-07"). */
  onRemove?: () => void
  removeLabel?: string
  children: ReactNode
}

/** A label tab: squared, bordered, uppercase mono. Filters, categories, flags. */
export function Tag({ tone = 'neutral', solid = false, icon, onRemove, removeLabel, className, children, ...rest }: TagProps) {
  return (
    <span className={cx(styles.tag, styles[tone], solid && styles.solid, className)} {...rest}>
      {icon ? <Icon name={icon} size={12} /> : null}
      <span className={styles.text}>{children}</span>
      {onRemove ? (
        <button type="button" className={styles.remove} onClick={onRemove} aria-label={removeLabel ?? 'Remove'}>
          <Icon name="x" size={10} />
        </button>
      ) : null}
    </span>
  )
}
