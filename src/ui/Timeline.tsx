import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { cx } from './internal/cx'
import { formatClock, formatStamp, toIso } from './internal/format'
import type { Tone } from './Tag'
import styles from './Timeline.module.css'

export interface TimelineItem {
  id: string
  /** ISO string, epoch ms or Date. */
  at: string | number | Date
  title: ReactNode
  detail?: ReactNode
  tone?: Tone
  icon?: IconName
  /** Small mono text on the right of the title line. */
  meta?: ReactNode
}

export interface TimelineProps {
  items: TimelineItem[]
  /** What to print when there are no items. */
  empty?: ReactNode
  /** Accessible name for the list. */
  label: string
  className?: string
}

/** Events in order on a vertical rule: lifecycle steps, a dispatch's history. Pass items in display order. */
export function Timeline({ items, empty = 'No entries.', label, className }: TimelineProps) {
  if (items.length === 0) return <p className={styles.none}>{empty}</p>
  return (
    <ol className={cx(styles.timeline, className)} aria-label={label}>
      {items.map((it) => (
        <li key={it.id} className={cx(styles.item, styles[it.tone ?? 'neutral'])}>
          <span className={styles.node} aria-hidden="true">
            {it.icon ? <Icon name={it.icon} size={12} /> : null}
          </span>
          <div className={styles.head}>
            <span className={styles.title}>{it.title}</span>
            <time className={styles.time} dateTime={toIso(it.at)}>
              {formatStamp(it.at)}
            </time>
            {it.meta ? <span className={styles.meta}>{it.meta}</span> : null}
          </div>
          {it.detail ? <div className={styles.detail}>{it.detail}</div> : null}
        </li>
      ))}
    </ol>
  )
}

export type LogLevel = 'debug' | 'info' | 'ok' | 'warn' | 'error'
export interface LogEntry {
  id: string | number
  at: string | number | Date
  level?: LogLevel
  /** Origin tag: "sw", "net", "query", "seam". */
  source?: string
  message: ReactNode
  /** Second line: a url, a payload summary. */
  detail?: ReactNode
}

export interface LogListProps {
  entries: LogEntry[]
  /** Accessible name for the log region. */
  label: string
  maxHeight?: number | string
  empty?: ReactNode
  /** Newest entry at the top. Default false (terminal order, newest at the bottom). */
  newestFirst?: boolean
  className?: string
}

/** '14:03:27.412' as ['14:03:27', '.412'], so narrow logs can drop the milliseconds. */
function splitClock(at: string | number | Date): [string, string] {
  const full = formatClock(at, true)
  const dot = full.indexOf('.')
  return dot < 0 ? [full, ''] : [full.slice(0, dot), full.slice(dot)]
}

const LEVEL_CODE: Record<LogLevel, string> = { debug: 'DBG', info: 'INF', ok: ' OK', warn: 'WRN', error: 'ERR' }

/** Terminal-style log: clock, level code, source, message. Keyboard-scrollable; does not announce updates. */
export function LogList({ entries, label, maxHeight = 320, empty = 'Nothing logged yet.', newestFirst = false, className }: LogListProps) {
  const rows = newestFirst ? [...entries].reverse() : entries
  return (
    <div className={cx(styles.log, className)} style={{ maxHeight }} role="log" aria-live="off" aria-label={label} tabIndex={0}>
      {rows.length === 0 ? (
        <p className={styles.none}>{empty}</p>
      ) : (
        <ul className={styles.lines}>
          {rows.map((e) => (
            <li key={e.id} className={cx(styles.line, styles[`lv_${e.level ?? 'info'}`])}>
              <time className={styles.clock} dateTime={toIso(e.at)}>
                {splitClock(e.at)[0]}
                <span className={styles.ms}>{splitClock(e.at)[1]}</span>
              </time>
              <span className={styles.code}>{LEVEL_CODE[e.level ?? 'info']}</span>
              {e.source ? <span className={styles.source}>{e.source}</span> : null}
              <span className={styles.msg}>
                {e.message}
                {e.detail ? <span className={styles.sub}>{e.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
