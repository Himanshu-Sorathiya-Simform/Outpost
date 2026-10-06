import type { Severity } from '@shared/contracts'
import { useSession } from '@/lib/queries'
import { Button, SeverityStamp, formatClock } from '@/ui'
import type { SubmitApi } from '../submit/useSubmitDispatch'
import { Notice } from './Notice'
import { SubmitFeedback } from './SubmitFeedback'
import styles from './FilingPanel.module.css'

export interface FilingPanelProps {
  submit: SubmitApi
  severity: Severity
  draftId: string | null
  savedAt: number | null
  /** The last write reached real storage. */
  persisted: boolean
  onDiscard: () => void
}

/** Everything around the button: what happened when it was pressed, and the state of the local draft. */
export function FilingPanel({ submit, severity, draftId, savedAt, persisted, onDiscard }: FilingPanelProps) {
  const session = useSession()
  const offShift = session.data !== undefined && session.data.session === null
  const limited = submit.state.status === 'rate-limited'

  return (
    <div className={styles.panel}>
      {offShift ? <Notice tone="quiet">You are off shift. Filing will ask you to clock in first. Nothing on this form is lost.</Notice> : null}

      <div className={styles.send}>
        <Button type="submit" variant="primary" size="lg" icon="send" loading={submit.pending} disabled={limited}>
          File dispatch
        </Button>
        <p className={styles.stampLine}>
          Stamped <SeverityStamp severity={severity} size="sm" />
        </p>
      </div>

      <div className={styles.live} aria-live="polite" aria-atomic="false">
        <SubmitFeedback state={submit.state} onRateLimitElapsed={submit.reset} />
      </div>

      <div className={styles.draft}>
        <p className={styles.draftLine}>
          {savedAt !== null
            ? `Draft saved ${formatClock(savedAt).slice(0, 5)}`
            : draftId
              ? 'Draft is on this device.'
              : 'Nothing saved yet. A draft starts when you type.'}
        </p>
        {draftId ? (
          <Button variant="quiet" size="sm" icon="trash" onClick={onDiscard}>
            Discard draft
          </Button>
        ) : null}
      </div>
      {persisted ? null : (
        <Notice tone="warn" title="Not stored">
          This browser would not store the draft. It lives in memory until the tab closes, so file it or copy it out before leaving.
        </Notice>
      )}
    </div>
  )
}
