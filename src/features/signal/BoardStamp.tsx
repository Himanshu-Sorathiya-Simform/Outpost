import type { ReactNode } from 'react'
import { Icon, cx, type IconName } from '@/ui'
import styles from './BoardStamp.module.css'

export interface BoardStampProps {
  tone: 'error' | 'warn' | 'idle'
  icon: IconName
  /** The stamp text, uppercase by style: "Last known: no link". */
  title: string
  children?: ReactNode
  className?: string
}

/**
 * A rubber stamp laid across the board with the reasons beneath it. Each tone has its own border style
 * (double, solid, dashed), so the level never depends on colour.
 */
export function BoardStamp({ tone, icon, title, children, className }: BoardStampProps) {
  return (
    <div className={cx(styles.box, styles[tone], className)} role="status">
      <p className={styles.title}>
        <Icon name={icon} size={16} />
        <span>{title}</span>
      </p>
      {children ? <div className={styles.body}>{children}</div> : null}
    </div>
  )
}
