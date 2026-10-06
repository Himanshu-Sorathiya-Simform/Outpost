import { useBridgeLog, useSwMessageLog } from '@/lib'
import { EmptyState, Loader, StatusDot, Tag, formatClock } from '@/ui'
import type { Run } from './QueueProtocolSend'
import { OutcomeStamp } from './QueueStamp'
import styles from './QueueProtocolReaction.module.css'

/**
 * What the app did with the last test message: the entry the bridge wrote in the message log, the calls it made into
 * src/pwa while reacting, and any toast it raised. The three come from three different places, so a gap is informative.
 */
export function QueueProtocolReaction({ run }: { run: Run | null }) {
  const messages = useSwMessageLog((s) => s.entries)
  const calls = useBridgeLog((s) => s.entries)

  if (!run) {
    return (
      <EmptyState compact icon="send" title="Nothing sent yet">
        Pick a template and send it. The message log entry, the seam calls and any toast it causes appear here.
      </EmptyState>
    )
  }

  const heard = messages.filter((m) => m.id > run.baseline.sw && m.direction === 'in')
  const made = calls.filter((c) => c.id > run.baseline.bridge)
  const silent = run.settled && heard.length === 0

  return (
    <div className={styles.root} aria-live="polite">
      <h3 className={styles.heading}>What the app did</h3>
      <StatusDot
        tone={heard.length > 0 ? 'ok' : silent ? 'error' : 'info'}
        live={!run.settled && heard.length === 0}
        label={heard.length > 0 ? `Heard it, by ${run.via === 'service-worker' ? 'the serviceWorker message event' : 'the outpost-sw channel'}, at ${formatClock(run.sentAt, true)}` : silent ? 'The bridge logged nothing' : 'Waiting for the bridge'}
      />
      {!run.settled && heard.length === 0 ? <Loader label="Waiting for the bridge" size="sm" /> : null}
      {silent ? <p className={styles.muted}>No message log entry appeared. The bridge listens from startup, so a message that vanished means its listener is not attached. Reload the page and try again.</p> : null}

      <ul className={styles.list} aria-label="Reaction to the test message">
        {heard.map((m) => (
          <li key={`m${m.id}`} className={styles.item}>
            <span className={styles.line}>
              <Tag tone={m.valid ? 'ok' : 'error'} icon={m.valid ? 'check' : 'x'}>
                {m.valid ? 'Valid' : 'Invalid'}
              </Tag>
              <strong>{m.type ?? 'no type'}</strong>
              <span className="muted">via {m.channel}</span>
            </span>
            {m.reason ? <p className={`${styles.what} ${styles.reason}`}>{m.reason}</p> : null}
            <p className={styles.what}>{m.note ?? (m.valid ? 'Logged, no other reaction.' : 'Kept in the log, nothing else done.')}</p>
          </li>
        ))}
        {[...made].reverse().map((c) => (
          <li key={`c${c.id}`} className={styles.item}>
            <span className={styles.line}>
              <OutcomeStamp outcome={c.outcome} />
              <strong>{c.feature}</strong>
              <span className="muted">seam call, {c.durationMs} ms</span>
            </span>
          </li>
        ))}
        {run.toasts.map((t) => (
          <li key={t.id} className={styles.item}>
            <span className={styles.line}>
              <Tag tone={t.tone === 'info' ? 'info' : t.tone} icon="bell">
                Toast
              </Tag>
              <strong>{t.title}</strong>
              {t.hasAction ? <span className="muted">with an action</span> : null}
            </span>
            {t.message ? <p className={styles.what}>{t.message}</p> : null}
          </li>
        ))}
      </ul>
      {run.settled && heard.length > 0 && made.length === 0 && run.toasts.length === 0 ? <p className={styles.muted}>No seam call and no toast. Some messages are meant to do nothing but be logged.</p> : null}
    </div>
  )
}
