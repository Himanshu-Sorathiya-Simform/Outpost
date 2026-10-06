import type { ReactNode } from 'react'
import { Icon, IconButton, cx, type IconName } from '@/ui'
import styles from './Banner.module.css'

export interface BannerProps {
  tone: 'info' | 'warn' | 'error'
  icon: IconName
  title: string
  children: ReactNode
  /** Buttons to the right of the text (Reload). */
  actions?: ReactNode
  /** Adds a close button. Omit for a banner that must stay until its condition clears. */
  onDismiss?: () => void
  dismissLabel?: string
}

/** A full-width notice above the page: a rule-edged strip with a tone bar, never a floating card. */
export function Banner({ tone, icon, title, children, actions, onDismiss, dismissLabel = 'Dismiss notice' }: BannerProps) {
  return (
    <section className={cx(styles.banner, styles[tone])} role="status" aria-label={title}>
      <span className={styles.tab} aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        <p className={styles.body}>{children}</p>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
      {onDismiss ? <IconButton icon="x" label={dismissLabel} variant="quiet" size="sm" onClick={onDismiss} className={styles.close} /> : null}
    </section>
  )
}
