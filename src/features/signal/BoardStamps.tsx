import type { SignalBoard } from '@shared/contracts'
import type { AppError } from '@/lib/errors/app-error'
import { TimeAgo, formatClock } from '@/ui'
import { BoardStamp } from './BoardStamp'
import { STALE_AFTER_MS, sampleAgeText, type Suspicion } from './signal'
import styles from './BoardStamps.module.css'

export interface BoardStampsProps {
  board: SignalBoard
  /** Client clock, ms. */
  now: number
  error: AppError | null
  retrying: boolean
  failureCount: number
  suspicion: Suspicion | null
  /**
   * How the board is being refreshed. 'polling' expects a new sample every few seconds, so silence is a fault;
   * 'manual' (one sample on request) does not.
   */
  mode: 'polling' | 'paused' | 'hidden' | 'manual'
}

/** Every reason the board on screen may not be live, stamped where the operator will see it. Empty when the board is live. */
export function BoardStamps({ board, now, error, retrying, failureCount, suspicion, mode }: BoardStampsProps) {
  const sampled = Date.parse(board.sampledAt)
  const age = now === 0 || Number.isNaN(sampled) ? 0 : now - sampled
  const silent = mode === 'polling' && !error && age > STALE_AFTER_MS

  return (
    <div className={styles.stack}>
      {error ? (
        <BoardStamp tone="error" icon="offline" title="Last known: no link">
          <p>
            These are not live readings. The last good sample was taken at <strong>{formatClock(board.sampledAt)}</strong> (<TimeAgo at={board.sampledAt} />, sequence {board.seq}). Every request since has failed.
          </p>
          <dl>
            <dt>Failure</dt>
            <dd>
              {error.kind}: {error.userMessage}
            </dd>
            {retrying ? (
              <>
                <dt>Now</dt>
                <dd>Trying again</dd>
              </>
            ) : null}
          </dl>
        </BoardStamp>
      ) : null}

      {suspicion ? (
        <BoardStamp tone="warn" icon="warning" title="Possibly cached: this endpoint should never be">
          <p>The relay stamps every answer with a sequence number and the time it was sampled. This answer does not look like one built for this request.</p>
          <dl>
            {suspicion.evidence.map((e) => (
              <EvidenceRow key={e.label} label={e.label} value={e.value} tripped={e.tripped} />
            ))}
          </dl>
        </BoardStamp>
      ) : null}

      {silent ? (
        <BoardStamp tone="warn" icon="hourglass" title={`No new sample for ${sampleAgeText(age)}`}>
          <p>
            The newest readings are older than {STALE_AFTER_MS / 1000} s and nothing newer has arrived.
            {failureCount > 0 ? ` The last request failed and is being retried (attempt ${failureCount + 1}).` : ' A request may be hanging.'} Treat the figures as history.
          </p>
        </BoardStamp>
      ) : null}

      {mode === 'paused' ? (
        <BoardStamp tone="idle" icon="pause" title="Paused">
          <p>
            Polling is off. The readings are frozen at {formatClock(board.sampledAt)} and age every second. Resume to sample again.
          </p>
        </BoardStamp>
      ) : mode === 'hidden' ? (
        <BoardStamp tone="idle" icon="eye-off" title="Tab hidden: polling stopped">
          <p>Nothing is requested while this tab is out of view. A fresh board is fetched when you return.</p>
        </BoardStamp>
      ) : null}
    </div>
  )
}

function EvidenceRow({ label, value, tripped }: { label: string; value: string; tripped: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {tripped ? <strong>{value} (suspect)</strong> : value}
      </dd>
    </>
  )
}
