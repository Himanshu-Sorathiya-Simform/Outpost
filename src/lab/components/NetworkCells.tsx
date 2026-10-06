import type { ResponseSource } from '@/lib/api/types'
import { cx, formatClock, formatDuration, SOURCE_LABEL, SourceGlyph } from '@/ui'
import styles from './NetworkCells.module.css'

export function TimeCell({ at }: { at: number }) {
  const full = formatClock(at, true)
  return (
    <span>
      {full.slice(0, 8)}
      <span className={styles.ms}>{full.slice(8)}</span>
    </span>
  )
}

/** HTTP status. Two numbers when client and server disagree, with the disagreement marked. */
export function StatusCell({ client, server, differs, failed }: { client: number | null; server: number | null; differs: boolean; failed: boolean }) {
  const text = (n: number | null): string => (n === null ? '-' : n === 0 ? 'none' : String(n))
  const lead = client ?? server
  const bad = failed || (lead !== null && lead >= 400)
  if (client !== null && server !== null && client !== server) {
    return (
      <span className={cx(styles.status, bad && styles.bad, differs && styles.differs)} title={`Client saw ${text(client)}, server logged ${text(server)}${differs ? '' : ' (a conditional 304 surfaces as 200 to fetch)'}`}>
        {text(client)} <span aria-hidden="true">|</span> {text(server)}
        <span className="sr-only"> client versus server</span>
      </span>
    )
  }
  return <span className={cx(styles.status, bad && styles.bad)}>{text(lead)}</span>
}

export function DurationCell({ client, server }: { client: number | null; server: number | null }) {
  if (client === null && server === null) return <span className={styles.dim}>-</span>
  if (client !== null && server !== null) {
    return (
      <span title={`Client ${formatDuration(client)}, server ${formatDuration(server)}`}>
        {formatDuration(client)} <span className={styles.dim}>/ {formatDuration(server)}</span>
      </span>
    )
  }
  return <span>{formatDuration((client ?? server) as number)}</span>
}

export function SourceCell({ source }: { source: ResponseSource | null }) {
  if (source === null) return <span className={styles.dim}>-</span>
  return (
    <span className={styles.source} title={SOURCE_LABEL[source]}>
      <SourceGlyph source={source} />
      <span className={styles.sourceText}>{SOURCE_LABEL[source]}</span>
    </span>
  )
}

export const shortTab = (tab: string | null, own: boolean): string => (tab === null ? 'none' : own ? 'this tab' : tab)
