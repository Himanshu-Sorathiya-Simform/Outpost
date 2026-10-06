import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ResponseMeta } from '@/lib/api/types'
import { CopyButton } from './CopyButton'
import { KeyValue, type KeyValueItem } from './KeyValue'
import { SOURCE_LABEL, SourceGlyph } from './SourceGlyph'
import { TimeAgo } from './TimeAgo'
import { cx } from './internal/cx'
import { useNow } from './internal/useNow'
import { formatAge, formatBytes, formatDuration, formatStamp } from './internal/format'
import styles from './ProvenanceChip.module.css'

/**
 * The browser held a stored copy and asked the server whether it was still good: the body came from the HTTP cache, but
 * the answer (a 304) came over the wire. A true cache hit moves no bytes at all (transferSize 0).
 */
const isRevalidated = (m: ResponseMeta): boolean => m.source === 'http-cache' && m.transferSize !== null && m.transferSize > 0
const labelOf = (m: ResponseMeta): string => (isRevalidated(m) ? 'HTTP cache 304' : SOURCE_LABEL[m.source])

const dash = <span className={styles.none}>-</span>
const text = (v: string | number | null): ReactNode => (v === null || v === '' ? dash : v)

function sections(m: ResponseMeta): Array<{ title: string; items: KeyValueItem[] }> {
  return [
    {
      title: 'Where it came from',
      items: [
        { label: 'Source', value: `${labelOf(m)} (${m.source})` },
        { label: 'Decided by', value: m.sourceReason },
        { label: 'Served by', value: text(m.servedBy) },
        { label: 'Request id', value: text(m.requestId) },
        { label: 'Injected fault', value: text(m.chaos) },
      ],
    },
    {
      title: 'How old the data is',
      items: [
        { label: 'Server clock', value: m.servedAt ? formatStamp(m.servedAt) : dash },
        { label: 'Arrived', value: formatStamp(m.fetchedAt) },
        { label: 'Data age at arrival', value: m.dataAgeMs === null ? dash : formatAge(m.dataAgeMs) },
        { label: 'Age header', value: m.ageHeader === null ? dash : `${m.ageHeader} s` },
        { label: 'Duration', value: formatDuration(m.durationMs) },
      ],
    },
    {
      title: 'HTTP validators',
      items: [
        { label: 'Cache-Control', value: text(m.cacheControl) },
        { label: 'ETag', value: text(m.etag) },
        { label: 'Resource rev', value: text(m.rev) },
        { label: 'API version', value: text(m.apiVersion) },
      ],
    },
    {
      title: 'Service worker stamps',
      items: [
        { label: 'X-SW-Source', value: text(m.swSource) },
        { label: 'X-SW-Strategy', value: text(m.swStrategy) },
        { label: 'X-SW-Cache', value: text(m.swCache) },
        { label: 'X-SW-Cached-At', value: m.swCachedAt ? formatStamp(m.swCachedAt) : dash },
      ],
    },
    {
      title: 'Transport',
      items: [
        { label: 'Request', value: `${m.method} ${m.url}` },
        { label: 'Status', value: m.status },
        { label: 'Body size', value: m.bytes === null ? dash : formatBytes(m.bytes) },
        { label: 'Transfer size', value: m.transferSize === null ? dash : formatBytes(m.transferSize) },
        { label: 'Delivery type', value: m.deliveryType === null ? dash : m.deliveryType === '' ? '(empty: network)' : m.deliveryType },
        { label: 'Redirected', value: m.redirected ? 'yes' : 'no' },
        { label: 'Response type', value: m.responseType },
      ],
    },
  ]
}

export interface ProvenanceChipProps {
  /** `undefined` while nothing has loaded (or the lab setting is off for this query). */
  meta: ResponseMeta | undefined
  /** Only the source badge. */
  compact?: boolean
  /** Data whose live age (age on arrival plus time since) passes this many ms is flagged STALE, whatever its source. Default 60 s. */
  staleAfterMs?: number
  className?: string
}

/**
 * Where did this data come from, and how old is it? A badge (distinct shape per source), the age
 * of the DATA (server clock, not fetch time) and the request duration. Click for every field.
 */
export function ProvenanceChip({ meta, compact = false, staleAfterMs = 60_000, className }: ProvenanceChipProps) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [align, setAlign] = useState<'left' | 'right'>('left')
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const now = useNow()

  useLayoutEffect(() => {
    if (!open || !root.current) return
    const r = root.current.getBoundingClientRect()
    setAlign(r.left + 440 > window.innerWidth && r.right - 440 > 0 ? 'right' : 'left')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!meta) {
    return (
      <span className={cx(styles.chip, styles.absent, className)} title="No response metadata for this data yet">
        <SourceGlyph source="unknown" />
        <span className={styles.label}>No provenance</span>
      </span>
    )
  }

  const elapsedMs = now === 0 ? 0 : Math.max(0, now - Date.parse(meta.fetchedAt))
  const liveAgeMs = meta.dataAgeMs === null ? null : Math.max(0, meta.dataAgeMs) + (Number.isNaN(elapsedMs) ? 0 : elapsedMs)
  const stale = liveAgeMs !== null && liveAgeMs > staleAfterMs
  const unknown = meta.source === 'unknown'
  return (
    <div ref={root} className={cx(styles.root, className)}>
      <button
        ref={button}
        type="button"
        className={cx(styles.chip, styles.button, styles[`tone_${meta.source.replace('-', '_')}`], open && styles.open)}
        aria-expanded={open}
        aria-controls={panelId}
        title={isRevalidated(meta) ? 'Stored copy confirmed by the server (conditional GET answered 304)' : undefined}
        onClick={() => setOpen(!open)}
      >
        <SourceGlyph source={meta.source} />
        <span className={styles.label}>{labelOf(meta)}</span>
        {compact ? null : (
          <>
            <span className={cx(styles.sep, styles.narrowHide)} aria-hidden="true" />
            <span className={cx(styles.fact, styles.narrowHide)}>{liveAgeMs === null ? 'age n/a' : `${formatAge(liveAgeMs)} old`}</span>
            <span className={cx(styles.sep, styles.narrowHide)} aria-hidden="true" />
            <span className={cx(styles.fact, styles.narrowHide)}>{formatDuration(meta.durationMs)}</span>
          </>
        )}
        {stale ? <span className={styles.stale}>Stale</span> : null}
        {unknown ? <span className={styles.stale}>Unverified</span> : null}
      </button>
      {open ? (
        <div id={panelId} role="region" aria-label="Response provenance" className={cx(styles.panel, align === 'right' && styles.right)}>
          <div className={styles.panelHead}>
            <p className={styles.headline}>
              <SourceGlyph source={meta.source} size={14} /> {labelOf(meta)}
              <span className={styles.ago}>
                fetched <TimeAgo at={meta.fetchedAt} />
              </span>
            </p>
            <CopyButton value={() => JSON.stringify(meta, null, 2)} label="Copy JSON" size="sm" variant="quiet" />
          </div>
          {isRevalidated(meta) ? (
            <p className={styles.note}>The browser had a stored copy and asked the server whether it was still current. The server answered 304, so the body came from the HTTP cache and the confirmation came over the network. A response served with no request at all would show a transfer size of 0.</p>
          ) : null}
          {unknown ? <p className={styles.note}>No service-worker header and no transfer-size evidence, so the source could not be decided. This is normal before you write a worker.</p> : null}
          {sections(meta).map((s) => (
            <section key={s.title} className={styles.section}>
              <h4 className={styles.sectionTitle}>{s.title}</h4>
              <KeyValue items={s.items} dense />
            </section>
          ))}
        </div>
      ) : null}
    </div>
  )
}
