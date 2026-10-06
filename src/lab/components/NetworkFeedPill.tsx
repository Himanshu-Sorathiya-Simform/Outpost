import type { FeedStatus } from '@/lib'
import { Button, StatusDot, type StatusTone } from '@/ui'
import styles from './NetworkFeedPill.module.css'

const STATUS: Record<FeedStatus, { tone: StatusTone; label: string; detail: string }> = {
  connecting: { tone: 'info', label: 'Connecting', detail: 'Opening the event stream to the server.' },
  open: { tone: 'ok', label: 'Live', detail: 'Server entries arrive as they happen.' },
  reconnecting: { tone: 'warn', label: 'Reconnecting', detail: 'The stream dropped. Rows newer than the last server entry read NO VERDICT until it is back.' },
  closed: { tone: 'idle', label: 'Closed', detail: 'No instrument holds the stream open.' },
}

/**
 * The feed's own `online` listener is what reconnects it (there is no other hook), so a manual reconnect fires that
 * event. It is only offered while the browser itself believes it is online: a synthetic `online` while offline
 * would lie to the net monitor too.
 */
function reconnect(): void {
  window.dispatchEvent(new Event('online'))
}

export function NetworkFeedPill({ status }: { status: FeedStatus }) {
  const s = STATUS[status]
  const canRetry = status === 'reconnecting' && navigator.onLine
  return (
    <div className={styles.pill}>
      <span role="status" aria-live="polite" className={styles.state}>
        <StatusDot tone={s.tone} live={status === 'open'} label={`Server feed: ${s.label}`} />
        <span className="sr-only">{s.detail}</span>
      </span>
      <Button size="sm" variant="ghost" icon="refresh" disabled={!canRetry} onClick={reconnect} title={canRetry ? 'Skip the backoff and reconnect now' : s.detail}>
        Reconnect
      </Button>
    </div>
  )
}
