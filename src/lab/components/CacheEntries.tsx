import { useCallback, useEffect, useState } from 'react'
import { toAppError } from '@/lib/errors/normalize'
import type { AppError } from '@/lib/errors/app-error'
import { deleteEntry, listRequests, readEntryMeta, shortUrl, type EntryMeta } from '../observers/cache-store'
import { Button, EmptyState, ErrorState, IconButton, Loader, Tag, formatBytes } from '@/ui'
import { CachePreview } from './CachePreview'
import styles from './CacheEntries.module.css'

const PAGE = 50

/** A re-listing returns new Request objects; keeping the old ones for unchanged keys stops open previews from reloading. */
function reuse(previous: Request[] | null, next: Request[]): Request[] {
  if (!previous) return next
  const old = new Map(previous.map((r) => [`${r.method} ${r.url}`, r]))
  return next.map((r) => old.get(`${r.method} ${r.url}`) ?? r)
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return value === null || value === '' ? null : (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

interface RowProps {
  cacheName: string
  request: Request
  tick: number
  onDeleted(url: string): void
}

function Row({ cacheName, request, tick, onDeleted }: RowProps) {
  const [meta, setMeta] = useState<EntryMeta | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    let current = true
    readEntryMeta(cacheName, request).then(
      (m) => current && setMeta(m),
      (err: unknown) => current && setError(toAppError(err, { source: 'lab:cache-entry' })),
    )
    return () => {
      current = false
    }
  }, [cacheName, request, tick])

  const remove = async (): Promise<void> => {
    try {
      await deleteEntry(cacheName, request)
      onDeleted(shortUrl(request.url))
    } catch (err) {
      setError(toAppError(err, { source: 'lab:cache-entry-delete' }))
    }
  }

  return (
    <li className={styles.item}>
      <div className={styles.top}>
        <div className={styles.head}>
          <span className={styles.method}>{request.method}</span>
          <span className={styles.url} title={request.url}>
            {shortUrl(request.url)}
          </span>
          {meta && !meta.missing ? <Tag tone={meta.opaque ? 'warn' : meta.status >= 200 && meta.status < 300 ? 'ok' : 'error'}>{meta.opaque ? 'opaque' : meta.status}</Tag> : null}
          {meta?.redirected ? <Tag>redirected</Tag> : null}
          {meta?.missing ? <Tag tone="warn">gone</Tag> : null}
        </div>
        <div className={styles.tools}>
          <Button size="sm" icon="eye" onClick={() => setPreview((p) => !p)} aria-expanded={preview} disabled={meta?.missing}>
            {preview ? 'Hide' : 'Preview'}
          </Button>
          <IconButton size="sm" icon="trash" label={`Delete entry ${shortUrl(request.url)}`} onClick={() => void remove()} />
        </div>
      </div>
      {error ? <ErrorState compact error={error} /> : null}
      {meta && !meta.missing ? (
        <dl className={styles.meta}>
          <Meta label="type" value={meta.type} />
          <Meta label="content-type" value={meta.opaque ? 'hidden' : meta.contentType} />
          <Meta label="length" value={meta.contentLength === null ? null : formatBytes(meta.contentLength)} />
          <Meta label="date" value={meta.date} />
          <Meta label="x-sw-cached-at" value={meta.cachedAt} />
          <Meta label="vary" value={meta.vary} />
        </dl>
      ) : null}
      {preview ? <CachePreview cacheName={cacheName} request={request} /> : null}
    </li>
  )
}

interface Props {
  cacheName: string
  /** Bumps when the parent re-reads; entries re-read with it. */
  tick: number
  filter: string
  onChanged(): void
}

/** Entries of one cache, 50 at a time. Keys are listed up front; each row reads its own headers. */
export function CacheEntries({ cacheName, tick, filter, onChanged }: Props) {
  const [requests, setRequests] = useState<Request[] | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [shown, setShown] = useState(PAGE)
  const [removed, setRemoved] = useState<string | null>(null)

  const load = useCallback(() => {
    let current = true
    listRequests(cacheName).then(
      (list) => {
        if (!current) return
        setRequests((prev) => reuse(prev, list))
        setError(null)
      },
      (err: unknown) => current && setError(toAppError(err, { source: 'lab:cache-keys' })),
    )
    return () => {
      current = false
    }
  }, [cacheName])

  useEffect(() => load(), [load, tick])

  const needle = filter.trim().toLowerCase()
  const matching = requests?.filter((r) => needle === '' || r.url.toLowerCase().includes(needle)) ?? []

  if (error && !requests) return <ErrorState error={error} onRetry={load} />
  if (!requests) {
    return (
      <div role="status">
        <Loader label="Listing entries" size="sm" />
      </div>
    )
  }
  return (
    <div>
      {error ? <ErrorState compact error={error} onRetry={load} /> : null}
      <p className={styles.bar} role="status">
        {removed ? `Deleted ${removed}.` : `${matching.length}${needle ? ` of ${requests.length}` : ''} ${matching.length === 1 ? 'entry' : 'entries'}${needle ? ` matching "${filter.trim()}"` : ''}.`}
      </p>
      {requests.length === 0 ? (
        <EmptyState compact icon="cache" title="This cache is empty">
          The bucket exists and holds nothing. A worker that opens a cache in install and never puts anything in it leaves this.
        </EmptyState>
      ) : matching.length === 0 ? (
        <EmptyState compact icon="search" title="No entry matches the filter">
          Filtering looks at the full URL, query string included.
        </EmptyState>
      ) : (
        <>
          <ul className={styles.list} aria-label={`Entries in ${cacheName}`}>
            {matching.slice(0, shown).map((r, i) => (
              <Row
                key={`${r.method} ${r.url} ${i}`}
                cacheName={cacheName}
                request={r}
                tick={tick}
                onDeleted={(url) => {
                  setRemoved(url)
                  onChanged()
                }}
              />
            ))}
          </ul>
          {matching.length > shown ? (
            <div className={styles.more}>
              <Button icon="arrow-down" onClick={() => setShown(shown + PAGE)}>
                Show {Math.min(PAGE, matching.length - shown)} more of {matching.length - shown}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
