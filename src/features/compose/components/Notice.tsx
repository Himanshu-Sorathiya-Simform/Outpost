import type { ReactNode } from 'react'
import { Icon, cx, type IconName } from '@/ui'
import styles from './Notice.module.css'

export type NoticeTone = 'info' | 'warn' | 'error' | 'ok' | 'quiet'

const ICON: Record<NoticeTone, IconName> = { info: 'info', warn: 'warning', error: 'bug', ok: 'check', quiet: 'info' }

export interface NoticeProps {
  tone?: NoticeTone
  title?: string
  children?: ReactNode
  /** Links or buttons under the text. */
  actions?: ReactNode
  className?: string
}

/** An inline ruled note: what happened, in a sentence, with the next step beside it. Announcement is up to the region it sits in. */
export function Notice({ tone = 'info', title, children, actions, className }: NoticeProps) {
  return (
    <div className={cx(styles.notice, styles[tone], className)}>
      <span className={styles.glyph} aria-hidden="true">
        <Icon name={ICON[tone]} size={16} />
      </span>
      <div className={styles.text}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children ? <div className={styles.body}>{children}</div> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </div>
  )
}
