import type { ReactNode } from 'react'
import type { Station } from '@shared/contracts'
import { Button, LinkButton, SeverityStamp, Tag, TimeAgo, type Tone } from '@/ui'
import { findStation } from '../form/validate'
import type { Draft, DraftOrigin } from './draft-schema'
import styles from './DraftRow.module.css'

const ORIGIN: Record<DraftOrigin, { tone: Tone; word: string; title: string }> = {
  manual: { tone: 'neutral', word: 'Typed', title: 'Written on this page and not sent yet.' },
  share: { tone: 'info', word: 'Shared in', title: 'Started from a link or the share sheet.' },
  'offline-failed': { tone: 'warn', word: 'Not sent', title: 'A send was tried and the relay could not be reached.' },
  queued: { tone: 'ok', word: 'Queued', title: 'Handed to the outbox.' },
}

export interface DraftRowProps {
  draft: Draft
  stations: readonly Station[] | undefined
  /** This draft is being sent right now. */
  sending: boolean
  /** Some draft is being sent; a second send would only queue behind it. */
  sendLocked: boolean
  /** Queued here, but the outbox list (when it is readable) does not hold its key. */
  leftOutbox: boolean
  onSend: () => void
  onDiscard: () => void
  children?: ReactNode
}

export function DraftRow({ draft, stations, sending, sendLocked, leftOutbox, onSend, onDiscard, children }: DraftRowProps) {
  const { input, origin } = draft
  const station = findStation(stations, input.stationId ?? '')
  const stamp = ORIGIN[origin]
  const title = input.title?.trim() || 'Untitled draft'
  return (
    <li className={styles.row}>
      <div className={styles.main}>
        <div className={styles.top}>
          <Tag tone={stamp.tone} title={stamp.title}>
            {stamp.word}
          </Tag>
          {input.severity ? <SeverityStamp severity={input.severity} size="sm" flat /> : null}
          <span className={styles.meta}>{station ? station.code : input.stationId || 'No station'}</span>
          <span className={styles.meta}>
            edited <TimeAgo at={draft.updatedAt} />
          </span>
        </div>
        <p className={styles.title}>{title}</p>
        {input.body ? <p className={styles.excerpt}>{input.body.length > 140 ? `${input.body.slice(0, 140).trimEnd()}…` : input.body}</p> : null}
        {draft.lastError ? <p className={styles.error}>Last error: {draft.lastError}</p> : null}
        {leftOutbox ? <p className={styles.meta}>No longer in the outbox. It was sent, or removed there.</p> : null}
        {children}
      </div>
      <div className={styles.actions}>
        <LinkButton to={`/file?draft=${encodeURIComponent(draft.id)}`} size="sm" icon="pen" aria-label={`Open draft: ${title}`}>
          Open
        </LinkButton>
        <Button size="sm" icon="send" loading={sending} disabled={sendLocked && !sending} onClick={onSend} aria-label={`Send now: ${title}`}>
          Send now
        </Button>
        <Button size="sm" variant="quiet" icon="trash" onClick={onDiscard} aria-label={`Discard draft: ${title}`}>
          Discard
        </Button>
      </div>
    </li>
  )
}
