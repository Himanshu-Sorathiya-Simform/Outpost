import { useEffect, useRef } from 'react'
import type { AppError } from '@/lib/errors/app-error'
import { Button } from './Button'
import { ErrorState } from './ErrorState'
import { Meter } from './Meter'
import styles from './LoadMore.module.css'

export interface LoadMoreProps {
  /** Items shown so far. */
  loaded: number
  /** Total matching items, when the server says. */
  total?: number
  hasMore: boolean
  /** A page is being fetched. */
  loading: boolean
  onLoadMore: () => void
  /** Failed to fetch the next page. Shown inline with a Retry that calls onLoadMore. */
  error?: AppError | null
  /** Plural noun for the count line. Default "entries". */
  noun?: string
  /** Also load automatically when this row scrolls into view. The button stays for keyboard and offline use. */
  auto?: boolean
  className?: string
}

/** Footer for a paged list: count, progress, and the button that fetches the next page. */
export function LoadMore({ loaded, total, hasMore, loading, onLoadMore, error, noun = 'entries', auto = false, className }: LoadMoreProps) {
  const sentinel = useRef<HTMLDivElement>(null)
  const latest = useRef(onLoadMore)
  useEffect(() => {
    latest.current = onLoadMore
  })
  const armed = auto && hasMore && !loading && !error

  useEffect(() => {
    const el = sentinel.current
    if (!armed || !el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) latest.current()
    }, { rootMargin: '240px' })
    io.observe(el)
    return () => io.disconnect()
  }, [armed, loaded])

  const count = total !== undefined ? `${loaded} of ${total} ${noun}` : `${loaded} ${noun}`
  return (
    <div ref={sentinel} className={className ? `${styles.root} ${className}` : styles.root}>
      {error ? <ErrorState error={error} compact onRetry={onLoadMore} retrying={loading} /> : null}
      <div className={styles.row}>
        <p className={styles.count} aria-live="polite">
          {hasMore ? `Showing ${count}` : `End of list. ${count}.`}
        </p>
        {total !== undefined && total > 0 ? <Meter label="Loaded" value={loaded} max={total} hideHeader size="sm" segments={24} tone="ink" className={styles.meter} /> : null}
        {hasMore && !error ? (
          <Button icon="arrow-down" loading={loading} onClick={onLoadMore}>
            {loading ? 'Fetching' : 'Load more'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
