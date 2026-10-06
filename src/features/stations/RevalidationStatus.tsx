import { StatusDot, TimeAgo } from '@/ui'
import styles from './RevalidationStatus.module.css'

export interface RevalidationStatusProps {
  dataUpdatedAt: number
  isFetching: boolean
  /** The fetch is waiting for a connection (lab network mode "online" while offline). */
  isPaused: boolean
  /** One line naming what the last revalidation changed, or null when nothing has. */
  changeSummary: string | null
}

/** "Revalidated 12 s ago", with the live state of the next check. Announced politely when it changes. */
export function RevalidationStatus({ dataUpdatedAt, isFetching, isPaused, changeSummary }: RevalidationStatusProps) {
  const state = isPaused ? (
    <StatusDot tone="warn" label="Waiting for a connection to revalidate" />
  ) : isFetching ? (
    <StatusDot tone="info" live label="Revalidating" />
  ) : null
  return (
    <div className={styles.wrap}>
      <p className={styles.line} role="status">
        <span className={styles.label}>Revalidated</span>
        <TimeAgo at={dataUpdatedAt} />
        {state}
      </p>
      {changeSummary ? <p className={styles.summary}>{changeSummary}</p> : null}
    </div>
  )
}
