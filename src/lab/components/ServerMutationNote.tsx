import type { AppError, AppErrorKind } from '@/lib'
import { StatusDot, Tag, cx, type Tone } from '@/ui'
import styles from './ServerMutationNote.module.css'

type MutationStatus = 'idle' | 'pending' | 'error' | 'success'

export interface MutationNoteProps {
  status: MutationStatus
  error: AppError | null
  /** Printed when the write went through. */
  success: string
  /** Printed while the request is in flight. */
  pending?: string
  className?: string
}

/** Expected in a half-built app: a stub, a missing browser API, a refused permission. Muted, never red. */
const QUIET: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>(['not-implemented', 'unsupported', 'permission', 'aborted'])
const WARN: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>(['offline', 'network', 'timeout', 'rate-limited', 'unavailable', 'conflict', 'cache-miss', 'parse'])

export const toneOfKind = (kind: AppErrorKind): Tone => (QUIET.has(kind) ? 'neutral' : WARN.has(kind) ? 'warn' : 'error')

/**
 * One line under a control that writes: idle prints nothing, pending prints what is in flight, success says what
 * changed and an error prints its kind as a stamp next to the message. Always a polite live region.
 */
export function MutationNote({ status, error, success, pending = 'Sending to the relay', className }: MutationNoteProps) {
  let body = null
  if (status === 'pending') {
    body = <StatusDot tone="info" live label={pending} />
  } else if (status === 'success') {
    body = <StatusDot tone="ok" label={success} />
  } else if (status === 'error' && error) {
    body = (
      <>
        <Tag tone={toneOfKind(error.kind)} icon={QUIET.has(error.kind) ? 'info' : 'warning'}>
          {error.kind}
        </Tag>
        <span className={styles.message}>{error.userMessage}</span>
      </>
    )
  }
  return (
    <p className={cx(styles.note, className)} role="status" aria-live="polite">
      {body}
    </p>
  )
}
