import { StatusDot, Tag } from '@/ui'
import type { QueryRowData } from './QueryModel'
import styles from './QueryStateCell.module.css'

/** Status, fetch status and freshness as three short words: none of them depends on colour. */
export function QueryStateCell({ row }: { row: QueryRowData }) {
  const statusTone = row.status === 'success' ? 'ok' : row.status === 'error' ? 'error' : 'info'
  return (
    <div className={styles.cell}>
      <Tag tone={statusTone}>{row.status}</Tag>
      {row.fetchStatus === 'idle' ? (
        <span className={styles.idle}>idle</span>
      ) : (
        <StatusDot tone={row.fetchStatus === 'fetching' ? 'info' : 'warn'} live={row.fetchStatus === 'fetching'} label={row.fetchStatus} size="sm" />
      )}
      {row.status === 'success' ? <Tag tone={row.stale ? 'warn' : 'neutral'}>{row.stale ? 'stale' : 'fresh'}</Tag> : null}
    </div>
  )
}
