import type { ReactNode } from 'react'
import { ErrorState, Icon, formatClock, cx } from '@/ui'
import type { ActionPhase, SeamActionState } from './use-seam-action'
import styles from './ActionNote.module.css'

export interface ActionNoteProps {
  state: Pick<SeamActionState<unknown>, 'phase' | 'error' | 'at'>
  /** What to say on success. Omit to say nothing (the card shows the result itself). */
  okText?: ReactNode
  /** Which src/pwa file is still a stub, for the muted "not wired up yet" line. */
  file: string
  /** What the browser refused, when `phase` is `denied`. */
  deniedText?: ReactNode
  /** What it means when the browser lacks the feature. */
  unsupportedText?: ReactNode
  /** Names the action the note is about, when a card has several. */
  subject?: string
  className?: string
}

const NOTE_PHASES: ReadonlySet<ActionPhase> = new Set<ActionPhase>(['running', 'ok', 'unwired', 'denied', 'unsupported'])

/**
 * The outcome line under a control that calls into src/pwa. Always an aria-live region, so the result of a click is
 * announced. A stub is a quiet, dashed note; only a real failure gets the error block.
 */
export function ActionNote({ state, okText, file, deniedText, unsupportedText, subject, className }: ActionNoteProps) {
  const { phase, error, at } = state
  let note: ReactNode = null
  if (NOTE_PHASES.has(phase)) {
    if (phase === 'running') note = <>Waiting on the browser.</>
    else if (phase === 'ok') note = okText ? <>{okText}{at ? <span className={styles.time}> {formatClock(at)}</span> : null}</> : null
    else if (phase === 'unwired') note = <>Not wired up yet. <code>{file}</code> is still a stub, so nothing happened.</>
    else if (phase === 'denied') note = deniedText ?? <>The browser refused. {error?.userMessage}</>
    else note = unsupportedText ?? <>This browser does not offer that.</>
  }
  return (
    <div className={cx(styles.wrap, className)} aria-live="polite">
      {note ? (
        <p className={cx(styles.note, styles[phase])}>
          <Icon name={phase === 'ok' ? 'check' : phase === 'denied' ? 'lock' : 'info'} size={14} />
          <span>
            {subject ? <strong className={styles.subject}>{subject}: </strong> : null}
            {note}
          </span>
        </p>
      ) : null}
      {phase === 'failed' && error ? <ErrorState compact error={error} /> : null}
    </div>
  )
}
