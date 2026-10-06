import type { ReactNode } from 'react'
import type { AppError, AppErrorKind } from '@/lib/errors/app-error'
import { Button } from './Button'
import { CopyButton } from './CopyButton'
import { Disclosure } from './Disclosure'
import { JsonView } from './JsonView'
import { KeyValue, type KeyValueItem } from './KeyValue'
import { Icon } from './icons'
import { cx } from './internal/cx'
import { formatStamp } from './internal/format'
import styles from './ErrorState.module.css'

type ErrorTone = 'quiet' | 'warn' | 'fault'

/**
 * How loud an error class should look. Anything that is expected in a half-built or offline app
 * (a stub, a missing API, a denied permission) stays quiet; transient transport trouble is a
 * warning; everything else is a fault.
 */
const QUIET: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>(['not-implemented', 'unsupported', 'permission', 'aborted'])
const WARN: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>(['offline', 'network', 'timeout', 'rate-limited', 'unavailable', 'cache-miss', 'chunk-load', 'parse', 'conflict', 'version-skew', 'quota'])
const toneOf = (kind: AppErrorKind): ErrorTone => (QUIET.has(kind) ? 'quiet' : WARN.has(kind) ? 'warn' : 'fault')

const KNOWN = new Set(['url', 'method', 'status', 'code', 'requestId', 'retryAfterSec', 'chaos', 'source'])

export interface ErrorStateProps {
  error: AppError
  /** Shown as the Retry button when the error is retryable. Omit to hide it. */
  onRetry?: () => void
  /** The retry is in flight. */
  retrying?: boolean
  retryLabel?: string
  /** Extra controls next to Retry: "Go to inbox", "Clear cache". */
  actions?: ReactNode
  /** Inline one-row version for inside tables, plates and list footers. */
  compact?: boolean
  /** Open the technical detail initially (the Lab does). */
  detailOpen?: boolean
  className?: string
}

function detailItems(error: AppError): KeyValueItem[] {
  const c = error.context
  const cause = error.cause instanceof Error ? `${error.cause.name}: ${error.cause.message}` : error.cause !== undefined ? String(error.cause) : undefined
  return [
    { label: 'Kind', value: error.kind },
    { label: 'Message', value: error.message },
    { label: 'Status', value: c.status, show: c.status !== undefined },
    { label: 'Request', value: c.url ? `${c.method ?? 'GET'} ${c.url}` : undefined, show: c.url !== undefined },
    { label: 'Server code', value: c.code, show: c.code !== undefined },
    { label: 'Request id', value: c.requestId, show: c.requestId !== undefined },
    { label: 'Injected by', value: c.chaos, show: c.chaos !== undefined },
    { label: 'Retry-After', value: c.retryAfterSec !== undefined ? `${c.retryAfterSec} s` : undefined, show: c.retryAfterSec !== undefined },
    { label: 'Raised in', value: c.source, show: c.source !== undefined },
    { label: 'Cause', value: cause, show: cause !== undefined },
    { label: 'Raised at', value: formatStamp(error.at) },
    { label: 'Error id', value: error.id },
  ]
}

export function ErrorState({ error, onRetry, retrying = false, retryLabel = 'Retry', actions, compact = false, detailOpen = false, className }: ErrorStateProps) {
  const tone = toneOf(error.kind)
  const extras = Object.fromEntries(Object.entries(error.context).filter(([k, v]) => !KNOWN.has(k) && v !== undefined))
  const canRetry = error.retryable && onRetry !== undefined
  const wait = error.context.retryAfterSec

  const controls =
    canRetry || actions ? (
      <div className={styles.controls}>
        {canRetry ? (
          <Button variant={tone === 'fault' ? 'primary' : 'ghost'} size={compact ? 'sm' : 'md'} icon="refresh" loading={retrying} onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
        {wait !== undefined && canRetry ? <span className={styles.wait}>Server asked for {wait} s</span> : null}
        {actions}
      </div>
    ) : null

  return (
    <div className={cx(styles.box, styles[tone], compact && styles.compact, className)} role={tone === 'quiet' ? 'status' : 'alert'}>
      <div className={styles.main}>
        <div className={styles.top}>
          <span className={styles.stamp}>
            <Icon name={tone === 'quiet' ? 'info' : tone === 'warn' ? 'warning' : 'bug'} size={14} />
            {error.kind}
          </span>
          {compact ? null : <span className={styles.ref}>Ref {error.id}</span>}
        </div>
        <p className={styles.message}>{error.userMessage}</p>
        {controls}
      </div>
      {compact ? null : (
        <div className={styles.detail}>
          <Disclosure summary="Technical detail" meta={`${error.kind}${error.context.status ? ` / ${error.context.status}` : ''}`} defaultOpen={detailOpen}>
            <div className={styles.stack}>
              <KeyValue items={detailItems(error)} dense />
              {Object.keys(extras).length > 0 ? <JsonView value={extras} title="Other context" expandDepth={2} maxHeight={200} copy={false} /> : null}
              {error.stack ? (
                <Disclosure summary="Stack trace" variant="rule">
                  <pre className={styles.stackTrace}>{error.stack}</pre>
                </Disclosure>
              ) : null}
              <CopyButton value={() => JSON.stringify(error.toJSON(), null, 2)} label="Copy report" size="sm" />
              <aside className={styles.teach}>
                <p className={styles.teachLabel}>What this teaches</p>
                <p className={styles.teachBody}>{error.hint}</p>
              </aside>
            </div>
          </Disclosure>
        </div>
      )}
    </div>
  )
}
