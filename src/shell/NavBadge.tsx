import type { ReactNode } from 'react'
import { useUnreadCount } from '@/features/inbox/useBadgeSync'
import { usePwaStore } from '@/pwa'
import styles from './Nav.module.css'

/** The count pill beside a nav entry: unread dispatches, or items waiting in the outbox. The fallback (the register number) when zero or unknown. */
export function NavBadge({ kind, fallback = null }: { kind: 'unread' | 'queue'; fallback?: ReactNode }) {
  const unread = useUnreadCount()
  const queued = usePwaStore((s) => s.queuedCount)
  const count = kind === 'unread' ? unread : queued
  if (!count) return <>{fallback}</>
  return (
    <span className={styles.pill}>
      {count > 99 ? '99+' : count}
      <span className="sr-only">{kind === 'unread' ? ' unread' : ' queued'}</span>
    </span>
  )
}
