import { Icon } from '@/ui'
import styles from './FreshnessNote.module.css'

/** Shown under a loading skeleton once the first attempt has failed, so a long wait does not look like a hang. */
export function RetryNote({ failureCount, noun }: { failureCount: number; noun: string }) {
  return (
    <div aria-live="polite">
      {failureCount > 0 ? (
        <p className={styles.note}>
          <Icon name="offline" size={14} />
          <span>
            The relay did not answer (attempt {failureCount} failed). Trying again to fetch the {noun}.
          </span>
        </p>
      ) : null}
    </div>
  )
}
