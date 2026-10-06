import type { OutboxItem } from '@shared/sw-protocol'
import { Button, StatusDot, TimeAgo, type StatusTone } from '@/ui'
import styles from './OutboxRow.module.css'

const TONE: Record<OutboxItem['status'], StatusTone> = { queued: 'idle', sending: 'info', failed: 'error' }
const WORDS: Record<OutboxItem['status'], string> = { queued: 'Queued', sending: 'Sending', failed: 'Failed' }

export interface OutboxRowProps {
  item: OutboxItem
  removing: boolean
  onRemove: () => void
}

export function OutboxRow({ item, removing, onRemove }: OutboxRowProps) {
  const { payload } = item
  return (
    <li className={styles.row}>
      <div className={styles.main}>
        <div className={styles.top}>
          <StatusDot tone={TONE[item.status]} live={item.status === 'sending'} label={WORDS[item.status]} />
          <span className={styles.meta}>
            {item.attempts} {item.attempts === 1 ? 'attempt' : 'attempts'}
          </span>
          <span className={styles.meta}>
            queued <TimeAgo at={item.createdAt} />
          </span>
        </div>
        <p className={styles.title}>{payload.title}</p>
        <p className={styles.sub}>
          {payload.stationId} / {payload.severity} / key {item.id.slice(0, 8)}
        </p>
        {item.lastError ? <p className={styles.error}>Last error: {item.lastError}</p> : null}
      </div>
      <div className={styles.actions}>
        <Button size="sm" variant="quiet" icon="trash" loading={removing} onClick={onRemove} aria-label={`Remove from outbox: ${payload.title}`}>
          Remove
        </Button>
      </div>
    </li>
  )
}
