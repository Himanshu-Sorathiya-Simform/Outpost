import { Button, Icon } from '@/ui'
import styles from './NewSincePill.module.css'

export interface NewSincePillProps {
  /** Revisions the server is ahead of the list. 0 hides the pill. */
  behind: number
  onRefresh: () => void
  refreshing: boolean
}

/** "N new or changed" - the server has moved on since this list was drawn. Put it inside a live region. */
export function NewSincePill({ behind, onRefresh, refreshing }: NewSincePillProps) {
  if (behind <= 0) return null
  return (
    <p className={styles.pill}>
      <Icon name="bolt" size={16} />
      <span className={styles.text}>{behind} new or changed since you loaded this page</span>
      <Button size="sm" variant="primary" icon="refresh" loading={refreshing} onClick={onRefresh}>
        Refresh
      </Button>
    </p>
  )
}
