import { formatBytes, formatDuration } from '@/ui'
import type { NetLogEntry } from '@/lib/api/net-log'
import type { RequestLogEntry } from '@shared/contracts'
import { DurationCell, shortTab, SourceCell, StatusCell, TimeCell } from './NetworkCells'
import type { GridColumn } from './NetworkGrid'
import type { JoinedRow } from './NetworkJoin'
import { NetworkStamp } from './NetworkStamp'
import styles from './NetworkColumns.module.css'

const dash = <span className={styles.dim}>-</span>

/** The joined ledger. On a phone: time, status and class on the first line, method and path on the second. */
export const JOINED_COLUMNS: readonly GridColumn<JoinedRow>[] = [
  { id: 'time', header: 'Time', width: '6.75rem', render: (r) => <TimeCell at={r.at} /> },
  { id: 'method', header: 'Method', width: '3.75rem', narrow: 'hide', render: (r) => r.method },
  {
    id: 'path',
    header: 'Path',
    width: 'minmax(9rem, 1fr)',
    narrow: 'wide',
    render: (r) => (
      <span title={r.path}>
        <span className={styles.phoneMethod}>{r.method} </span>
        {r.path}
      </span>
    ),
  },
  { id: 'status', header: 'Status C|S', width: '6rem', render: (r) => <StatusCell client={r.clientStatus} server={r.serverStatus} differs={r.statusDiffers} failed={r.failed} /> },
  { id: 'duration', header: 'Time C / S', width: '8rem', narrow: 'hide', render: (r) => <DurationCell client={r.client?.durationMs ?? null} server={r.server?.durationMs ?? null} /> },
  { id: 'source', header: 'Source', width: '6.5rem', narrow: 'hide', render: (r) => <SourceCell source={r.client?.source ?? null} /> },
  {
    id: 'class',
    header: 'Class',
    width: '9.5rem',
    render: (r) => (
      <span className={styles.classCell}>
        <NetworkStamp cls={r.cls} />
        {r.link === 'heuristic' ? (
          <span className={styles.heur} title="Joined by tab, path and time, not by request id">
            ~<span className="sr-only"> heuristic join</span>
          </span>
        ) : null}
      </span>
    ),
  },
  { id: 'tab', header: 'Tab', width: '6rem', narrow: 'hide', render: (r) => (r.tab === null ? dash : shortTab(r.tab, r.ownTab)) },
  { id: 'chaos', header: 'Chaos', width: 'minmax(5rem, 10rem)', narrow: 'hide', render: (r) => (r.chaos ? <span title={r.chaos}>{r.chaos}</span> : dash) },
]

export const CLIENT_COLUMNS: readonly GridColumn<NetLogEntry>[] = [
  { id: 'time', header: 'Time', width: '6.75rem', render: (c) => <TimeCell at={c.startedAt} /> },
  { id: 'method', header: 'Method', width: '3.75rem', narrow: 'hide', render: (c) => c.method },
  {
    id: 'url',
    header: 'URL',
    width: 'minmax(9rem, 1fr)',
    narrow: 'wide',
    render: (c) => (
      <span title={c.url}>
        <span className={styles.phoneMethod}>{c.method} </span>
        {c.url}
      </span>
    ),
  },
  { id: 'status', header: 'Status', width: '4.5rem', render: (c) => <StatusCell client={c.status} server={null} differs={false} failed={c.status === 0} /> },
  { id: 'duration', header: 'Took', width: '5.5rem', numeric: true, render: (c) => formatDuration(c.durationMs) },
  { id: 'source', header: 'Source', width: '6.5rem', narrow: 'hide', render: (c) => <SourceCell source={c.source} /> },
  { id: 'error', header: 'Error kind', width: '7.5rem', render: (c) => c.errorKind ?? dash },
  { id: 'rid', header: 'Request id', width: '7rem', narrow: 'hide', render: (c) => c.requestId ?? dash },
  { id: 'chaos', header: 'Chaos', width: 'minmax(5rem, 9rem)', narrow: 'hide', render: (c) => (c.chaos ? <span title={c.chaos}>{c.chaos}</span> : dash) },
  { id: 'bytes', header: 'Body', width: '4.5rem', numeric: true, narrow: 'hide', render: (c) => (c.bytes === null ? dash : formatBytes(c.bytes)) },
]

export const SERVER_COLUMNS: readonly GridColumn<RequestLogEntry>[] = [
  { id: 'seq', header: 'Seq', width: '3.5rem', numeric: true, narrow: 'hide', render: (s) => s.seq },
  { id: 'time', header: 'Finished', width: '6.75rem', render: (s) => <TimeCell at={Date.parse(s.ts)} /> },
  { id: 'method', header: 'Method', width: '3.75rem', narrow: 'hide', render: (s) => s.method },
  {
    id: 'path',
    header: 'Path',
    width: 'minmax(9rem, 1fr)',
    narrow: 'wide',
    render: (s) => (
      <span title={s.path}>
        <span className={styles.phoneMethod}>{s.method} </span>
        {s.path}
      </span>
    ),
  },
  { id: 'status', header: 'Status', width: '4.5rem', render: (s) => <StatusCell client={s.status} server={null} differs={false} failed={s.status === 0} /> },
  { id: 'duration', header: 'Took', width: '5.5rem', numeric: true, render: (s) => formatDuration(s.durationMs) },
  { id: 'dest', header: 'Fetch dest', width: '6rem', narrow: 'hide', render: (s) => s.dest ?? dash },
  { id: 'tab', header: 'Tab', width: '7.5rem', narrow: 'hide', render: (s) => s.tab ?? dash },
  { id: 'chaos', header: 'Chaos', width: 'minmax(5rem, 9rem)', narrow: 'hide', render: (s) => (s.chaos ? <span title={s.chaos}>{s.chaos}</span> : dash) },
  { id: 'notes', header: 'Notes', width: 'minmax(6rem, 11rem)', narrow: 'hide', render: (s) => (s.notes.length > 0 ? <span title={s.notes.join(', ')}>{s.notes.join(', ')}</span> : dash) },
]

