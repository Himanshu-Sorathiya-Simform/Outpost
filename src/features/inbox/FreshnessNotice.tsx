import type { ReactNode } from 'react'
import type { ResponseMeta } from '@/lib/api/types'
import type { AppError } from '@/lib/errors/app-error'
import { useNetStatus } from '@/lib/net'
import { useNow } from '@/lib/queries/clock'
import { Button, Icon, SOURCE_LABEL, TimeAgo, cx } from '@/ui'
import styles from './FreshnessNotice.module.css'

export interface FreshnessNoticeProps {
  /** What the notice is about: "counters", "unread list". */
  subject: string
  meta: ResponseMeta | undefined
  hasData: boolean
  isError: boolean
  error: AppError | null
  isFetching: boolean
  onRetry: () => void
  className?: string
}

/**
 * A cache can legitimately hand back a copy that is seconds old (Chrome also reports a 304 revalidation as a cache hit),
 * which is not news. Past this age the copy is worth a notice.
 */
const STORED_COPY_AFTER_MS = 10_000

const CACHED_SOURCES: ReadonlySet<ResponseMeta['source']> = new Set(['sw-cache', 'sw-fallback', 'http-cache'])

/**
 * Says so when the figures on screen are not live: a refresh that failed while older data is still showing, an answer
 * that came out of a cache, or a device with no link. Renders nothing when the data is fresh from the network.
 */
export function FreshnessNotice({ subject, meta, hasData, isError, error, isFetching, onRetry, className }: FreshnessNoticeProps) {
  const browserOnline = useNetStatus((s) => s.browserOnline)
  const now = useNow()
  if (!hasData) return null

  const asOf = meta ? (meta.servedAt ?? meta.fetchedAt) : null
  const age = asOf ? <TimeAgo at={asOf} /> : 'an unknown time ago'
  const ageMs = asOf ? now - Date.parse(asOf) : 0
  const cached = meta !== undefined && CACHED_SOURCES.has(meta.source) && ageMs > STORED_COPY_AFTER_MS

  let tone: 'warn' | 'info'
  let body: ReactNode
  if (isError) {
    tone = 'warn'
    body = (
      <>
        Could not refresh the {subject} ({error?.userMessage ?? 'no answer'}). Still showing the copy from {age}.
      </>
    )
  } else if (cached) {
    tone = 'info'
    body = (
      <>
        Showing a stored copy of the {subject} from {age}. Answered by: {SOURCE_LABEL[meta.source]}.{isFetching ? ' Checking for a newer one.' : ''}
      </>
    )
  } else if (!browserOnline) {
    tone = 'warn'
    body = (
      <>
        No link. What the {subject} shows is from {age} and may have moved since.
      </>
    )
  } else {
    return null
  }

  return (
    <div className={cx(styles.notice, styles[tone], className)} role="status">
      <Icon name={tone === 'warn' ? 'warning' : 'info'} size={16} />
      <p className={styles.text}>{body}</p>
      {isError ? (
        <Button size="sm" icon="refresh" loading={isFetching} onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}
