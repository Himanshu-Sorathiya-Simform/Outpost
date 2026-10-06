import type { ResponseSource } from '@/lib/api/types'
import type { AppError } from '@/lib/errors/app-error'
import { SOURCE_LABEL, SourceGlyph, Tag } from '@/ui'
import { seenText, verdictText } from './BenchRun'
import type { SeenState, Verdict } from './BenchStore'
import styles from './BenchBadges.module.css'

/** FRESH / STALE by N / AHEAD / NO VERDICT. The wording and the icon carry the meaning, the tone only backs them up. */
export function VerdictTag({ verdict }: { verdict: Verdict }) {
  const tone = verdict.kind === 'fresh' ? 'ok' : verdict.kind === 'stale' ? 'warn' : verdict.kind === 'ahead' ? 'info' : 'neutral'
  const icon = verdict.kind === 'fresh' ? 'check' : verdict.kind === 'stale' ? 'clock' : verdict.kind === 'ahead' ? 'arrow-up' : 'info'
  return (
    <Tag tone={tone} icon={icon} solid={verdict.kind === 'fresh'}>
      {verdictText(verdict)}
    </Tag>
  )
}

export function SeenTag({ seen, status }: { seen: SeenState; status: number | null }) {
  const suffix = seen === 'seen' && status !== null && status !== 200 ? ` (${status})` : ''
  return (
    <Tag tone={seen === 'seen' ? 'accent' : 'neutral'} icon={seen === 'seen' ? 'server' : 'cache'}>
      {seenText(seen)}
      {suffix}
    </Tag>
  )
}

export function SourceCell({ source }: { source: ResponseSource }) {
  return (
    <span className={styles.source}>
      <SourceGlyph source={source} />
      {SOURCE_LABEL[source]}
    </span>
  )
}

/**
 * An AppError as a stamp: its kind, never its message text, decides the look. A cache-only miss is the route doing its
 * job, so it reads as an expected result rather than a fault.
 */
export function ErrorStamp({ error }: { error: AppError }) {
  const expected = error.kind === 'cache-miss'
  return (
    <span className={styles.stamp}>
      <Tag tone={expected ? 'info' : error.retryable ? 'warn' : 'error'} icon={expected ? 'info' : 'warning'}>
        {error.kind}
      </Tag>
      {expected ? <span className={styles.expected}>expected miss</span> : null}
    </span>
  )
}
