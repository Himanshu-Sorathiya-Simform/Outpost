import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { cx } from './internal/cx'
import styles from './EmptyState.module.css'

export interface EmptyStateProps {
  title: string
  /** One or two sentences: what is empty, and why, and what would fill it. */
  children?: ReactNode
  icon?: IconName
  /** A Button or LinkButton offering the obvious next step. */
  action?: ReactNode
  /** Tighter variant for inside a table or a small plate. */
  compact?: boolean
  className?: string
}

/** The "nothing here" state, drawn as a blank ruled ledger page. */
export function EmptyState({ title, children, icon = 'log', action, compact = false, className }: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, compact && styles.compact, className)}>
      <span className={styles.glyph} aria-hidden="true">
        <Icon name={icon} size={compact ? 22 : 28} />
      </span>
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        {children ? <p className={styles.body}>{children}</p> : null}
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  )
}
