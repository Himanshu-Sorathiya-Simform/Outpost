import { useEffect } from 'react'
import { useNow } from '@/lib/queries/clock'
import { ErrorState, LinkButton } from '@/ui'
import type { SubmitState } from '../submit/useSubmitDispatch'
import { Notice } from './Notice'

export const KEPT_LOCALLY_COPY = 'Saved on this device. Automatic sending is not wired up yet — use Send now from Drafts when you have a signal.'

/** Counts the relay's Retry-After down, in its own component so the page around it does not re-render every second. */
function RateLimitCountdown({ until, onElapsed }: { until: number; onElapsed: () => void }) {
  const now = useNow()
  const left = Math.max(0, Math.ceil((until - now) / 1000))
  useEffect(() => {
    if (left === 0) onElapsed()
  }, [left, onElapsed])
  return <span aria-hidden="true">{left}</span>
}

export interface SubmitFeedbackProps {
  state: SubmitState
  /** Only show feedback that belongs to this draft (the drafts list shares one submit hook across rows). */
  draftId?: string
  /** List the field problems as text. The compose page shows them on the fields instead. */
  listFieldErrors?: boolean
  onRateLimitElapsed: () => void
  /** Where to send someone to fix an incomplete draft. */
  openHref?: string
}

export function SubmitFeedback({ state, draftId, listFieldErrors = false, onRateLimitElapsed, openHref }: SubmitFeedbackProps) {
  if (state.status === 'idle' || (draftId !== undefined && state.draftId !== draftId)) return null

  switch (state.status) {
    case 'sending':
      return <Notice tone="info">Sending to the relay. A slow link can hold this for a while; the entry is already saved on this device.</Notice>

    case 'invalid': {
      const messages = Object.values(state.errors)
      return (
        <Notice
          tone="warn"
          title="Not sent"
          actions={
            openHref ? (
              <LinkButton to={openHref} size="sm" icon="pen">
                Open to finish it
              </LinkButton>
            ) : undefined
          }
        >
          {listFieldErrors ? (
            <ul>
              {messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            <p>{messages.length === 1 ? 'One field needs' : `${messages.length} fields need`} attention. Nothing was sent.</p>
          )}
        </Notice>
      )
    }

    case 'rejected': {
      const messages = Object.values(state.errors)
      return (
        <Notice
          tone="error"
          title="The relay rejected this entry"
          actions={
            openHref ? (
              <LinkButton to={openHref} size="sm" icon="pen">
                Open to fix it
              </LinkButton>
            ) : undefined
          }
        >
          {listFieldErrors || messages.length === 0 ? (
            <p>{messages.length === 0 ? state.error.message : messages.join(' ')}</p>
          ) : (
            <p>Check the marked fields. Your text is kept.</p>
          )}
        </Notice>
      )
    }

    case 'awaiting-session':
      return <Notice tone="info">Waiting for you to clock in. The entry is kept and will be sent as soon as your shift starts.</Notice>

    case 'no-session':
      return <Notice tone="warn">Not filed. The relay only takes dispatches from an operator on shift. Try again when you have clocked in.</Notice>

    case 'rate-limited':
      return (
        <Notice tone="warn" title="Slow down">
          <p>
            The relay is rate limiting this device. Try again in <RateLimitCountdown until={state.until} onElapsed={onRateLimitElapsed} /> s.
          </p>
          <span className="sr-only">The send button comes back when the wait is over.</span>
        </Notice>
      )

    case 'failed':
      if (state.error.kind === 'conflict') {
        return (
          <Notice tone="warn" title="Conflicting entry">
            <p>
              The relay says it already holds something that conflicts with this dispatch. Your text is still here. Look in the log for a similar dispatch
              before filing again.
            </p>
          </Notice>
        )
      }
      return <ErrorState compact error={state.error} />

    case 'kept-locally':
      return (
        <Notice
          tone="warn"
          title="Not sent"
          actions={
            draftId === undefined ? (
              <LinkButton to="/drafts" size="sm" icon="file">
                Open drafts
              </LinkButton>
            ) : undefined
          }
        >
          <p>{state.error.userMessage}</p>
          <p>
            {draftId === undefined
              ? KEPT_LOCALLY_COPY
              : 'Still on this device. Automatic sending is not wired up yet, so press Send now again when there is a signal.'}
          </p>
        </Notice>
      )

    case 'queue-failed':
      return (
        <div>
          <Notice tone="warn" title="Not sent. Kept on this device.">
            <p>{state.error.userMessage} The outbox could not take it either.</p>
          </Notice>
          <ErrorState compact error={state.cause} />
        </div>
      )
  }
}
