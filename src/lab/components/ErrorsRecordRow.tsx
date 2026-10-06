import type { ErrorRecord } from '@/lib'
import { CopyButton, Icon, JsonView, KeyValue, Tag, TimeAgo, cx, formatStamp, type KeyValueItem } from '@/ui'
import { ErrorsKindStamp } from './ErrorsKindStamp'
import styles from './ErrorsRecordRow.module.css'

/** Context fields the key-value block prints itself; everything else goes into the JSON tree. */
const SHOWN = new Set(['url', 'method', 'status', 'code', 'requestId', 'retryAfterSec', 'chaos', 'source'])

export const recordToJson = (record: ErrorRecord) => ({
  source: record.source,
  count: record.count,
  firstAt: new Date(record.firstAt).toISOString(),
  lastAt: new Date(record.lastAt).toISOString(),
  error: record.error.toJSON(),
})

function contextItems(record: ErrorRecord): KeyValueItem[] {
  const c = record.error.context
  return [
    { label: 'Request', value: c.url ? `${c.method ?? 'GET'} ${c.url}` : undefined, show: c.url !== undefined },
    { label: 'Status', value: c.status, show: c.status !== undefined },
    { label: 'Server code', value: c.code, show: c.code !== undefined },
    { label: 'Request id', value: c.requestId, show: c.requestId !== undefined },
    { label: 'Injected by', value: c.chaos, show: c.chaos !== undefined },
    { label: 'Retry-After', value: c.retryAfterSec !== undefined ? `${c.retryAfterSec} s` : undefined, show: c.retryAfterSec !== undefined },
    { label: 'Retryable', value: record.error.retryable ? 'yes' : 'no' },
    { label: 'First seen', value: formatStamp(record.firstAt) },
    { label: 'Last seen', value: formatStamp(record.lastAt) },
    { label: 'Error id', value: record.error.id },
  ]
}

export interface ErrorsRecordRowProps {
  record: ErrorRecord
  open: boolean
  onToggle: () => void
}

/** One line in the error centre: the stamp, both messages, where it came from, how often. Opens to its context and lesson. */
export function ErrorsRecordRow({ record, open, onToggle }: ErrorsRecordRowProps) {
  const { error } = record
  const panel = `err-${record.id}`
  const extras = Object.fromEntries(Object.entries(error.context).filter(([k, v]) => !SHOWN.has(k) && v !== undefined))
  return (
    <li className={cx(styles.row, open && styles.open)}>
      <button type="button" className={styles.head} aria-expanded={open} aria-controls={panel} onClick={onToggle}>
        <span className={styles.glyph} aria-hidden="true">
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
        </span>
        <ErrorsKindStamp kind={error.kind} size="sm" />
        <span className={styles.text}>
          <span className={styles.user}>{error.userMessage}</span>
          <span className={styles.tech}>{error.message}</span>
        </span>
        <span className={styles.meta}>
          <span className={styles.source}>{record.source ?? 'no source'}</span>
          <span className={styles.when}>
            {record.count > 1 ? (
              <Tag tone="warn" title={`${record.count} identical errors in a row collapsed into this row`}>
                x{record.count}
              </Tag>
            ) : null}
            <TimeAgo at={record.lastAt} />
          </span>
        </span>
      </button>
      {open ? (
        <div id={panel} className={styles.detail}>
          <KeyValue items={contextItems(record)} dense />
          {Object.keys(extras).length > 0 ? <JsonView value={extras} title="Other context" expandDepth={2} maxHeight={220} copy={false} /> : null}
          <aside className={styles.teach}>
            <p className={styles.teachLabel}>What this teaches</p>
            <p className={styles.teachBody}>{error.hint}</p>
          </aside>
          <div>
            <CopyButton value={() => JSON.stringify(recordToJson(record), null, 2)} label="Copy this row" />
          </div>
        </div>
      ) : null}
    </li>
  )
}
