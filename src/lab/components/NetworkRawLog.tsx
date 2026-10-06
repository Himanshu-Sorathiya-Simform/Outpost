import { useMemo, useState, type ReactNode } from 'react'
import type { AppError } from '@/lib'
import { Button, EmptyState, ErrorState, Field, Input } from '@/ui'
import { NetworkGrid, type GridColumn } from './NetworkGrid'
import styles from './NetworkRawLog.module.css'

export interface NetworkRawLogProps<T> {
  rows: readonly T[]
  columns: readonly GridColumn<T>[]
  rowKey: (row: T) => string
  /** Text the filter box searches. */
  haystack: (row: T) => string
  label: string
  /** Shown when the log is empty. */
  empty: ReactNode
  clearLabel: string
  onClear: () => void
  clearing?: boolean
  clearError?: AppError | null
  caption: ReactNode
  flag?: (row: T) => 'ok' | 'warn' | 'error' | undefined
}

/** A plain log with a search box and a clear button: the CLIENT and SERVER tabs. */
export function NetworkRawLog<T>({ rows, columns, rowKey, haystack, label, empty, clearLabel, onClear, clearing = false, clearError, caption, flag }: NetworkRawLogProps<T>) {
  const [text, setText] = useState('')
  const q = text.trim().toLowerCase()
  const shown = useMemo(() => (q ? rows.filter((r) => haystack(r).toLowerCase().includes(q)) : rows), [rows, q, haystack])
  return (
    <div className={styles.stack}>
      <p className={styles.caption}>{caption}</p>
      <div className={styles.tools}>
        <Field label="Search this log" className={styles.search}>
          <Input type="search" leading="search" value={text} placeholder="path, status, request id" autoComplete="off" spellCheck={false} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Button icon="trash" variant="danger" loading={clearing} disabled={rows.length === 0} onClick={onClear}>
          {clearLabel}
        </Button>
        <span className={styles.count} aria-live="polite">
          {q ? `${shown.length} of ${rows.length} entries` : `${rows.length} entries`}
        </span>
      </div>
      {clearError ? <ErrorState compact error={clearError} /> : null}
      {shown.length === 0 ? (
        <EmptyState compact icon="log" title={rows.length === 0 ? 'Empty' : 'Nothing matches'}>
          {rows.length === 0 ? empty : 'No entry contains that text.'}
        </EmptyState>
      ) : (
        <NetworkGrid rows={shown} columns={columns} rowKey={rowKey} label={label} flag={flag} />
      )}
    </div>
  )
}
