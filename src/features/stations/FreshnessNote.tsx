import type { ReactNode } from 'react'
import type { ResponseMeta } from '@/lib/api/types'
import type { AppError } from '@/lib/errors/app-error'
import { ErrorState, Icon, TimeAgo, cx } from '@/ui'
import { dataTimestamp, describeDelivery } from './freshness'
import styles from './FreshnessNote.module.css'

export interface FreshnessNoteProps {
  /** What the data is: "station register", "chapter". */
  noun: string
  meta: ResponseMeta | undefined
  dataUpdatedAt: number
  isFetching: boolean
  /** The error of the latest attempt. Only meaningful alongside data; with no data the page shows a full ErrorState. */
  error: AppError | null
  /** Failed attempts of the request in flight; the error only surfaces once the retries are spent. */
  failureCount?: number
  onRetry: () => void
  className?: string
}

/**
 * Says so when the data on screen is not straight from the relay: a stored copy, a copy from an earlier visit, or the
 * last good copy after a refresh failed. Renders nothing for live data, inside a polite live region so changes are read out.
 */
export function FreshnessNote({ noun, meta, dataUpdatedAt, isFetching, error, failureCount = 0, onRetry, className }: FreshnessNoteProps) {
  const delivery = describeDelivery(meta, dataUpdatedAt)
  const produced = dataTimestamp(meta, dataUpdatedAt)

  let note: ReactNode = null
  if (delivery === 'stored') {
    note = (
      <>
        Showing the stored copy of the {noun} from <TimeAgo at={produced} />.{isFetching ? ' Asking the relay for a newer one.' : ''}
      </>
    )
  } else if (delivery === 'earlier-visit') {
    note = (
      <>
        Showing the {noun} kept from an earlier visit, <TimeAgo at={produced} />.{isFetching ? ' Asking the relay for a newer one.' : ''}
      </>
    )
  } else if (delivery === 'fallback') {
    note = <>This {noun} was put together by the service worker, not the relay. It may be empty or out of date.</>
  }

  const retrying = isFetching && failureCount > 0 && !error

  return (
    <div className={cx(styles.wrap, className)} aria-live="polite">
      {error ? (
        <ErrorState
          compact
          error={error}
          onRetry={onRetry}
          retrying={isFetching}
          actions={
            <span className={styles.kept}>
              Keeping the {noun} from <TimeAgo at={produced} />.
            </span>
          }
        />
      ) : null}
      {retrying ? (
        <p className={styles.note}>
          <Icon name="offline" size={14} />
          <span>The relay did not answer (attempt {failureCount} failed). Trying again; what is on screen is the {noun} from <TimeAgo at={produced} />.</span>
        </p>
      ) : null}
      {note ? (
        <p className={styles.note}>
          <Icon name="clock" size={14} />
          <span>{note}</span>
        </p>
      ) : null}
    </div>
  )
}
