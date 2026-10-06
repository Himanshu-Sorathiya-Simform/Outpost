import { Button, Icon, TimeAgo, cx } from '@/ui'
import { describeFreshness, type FreshnessInput } from '../freshness'
import styles from './FreshnessNotice.module.css'

export interface FreshnessNoticeProps extends FreshnessInput {
  /** Name of what is on screen, for the sentence: 'log', 'dispatch'. */
  subject: string
  onRetry: () => void
  retrying?: boolean
  className?: string
}

/**
 * The honest line above data that is not fresh from the relay: what it is, where it came from and how old it is.
 * Renders nothing when the data is fresh. Put it inside a live region so that its appearance is announced.
 */
export function FreshnessNotice({ subject, onRetry, retrying = false, className, ...input }: FreshnessNoticeProps) {
  const freshness = describeFreshness(input)
  if (!freshness) return null
  return (
    <div className={cx(styles.notice, styles[freshness.tone], className)}>
      <Icon name={freshness.cause === 'paused' ? 'offline' : freshness.tone === 'warn' ? 'warning' : 'cache'} size={18} className={styles.icon} />
      <p className={styles.text}>
        <strong className={styles.title}>{freshness.title}.</strong> {freshness.detail} Showing the stored {subject}
        {freshness.since ? (
          <>
            {' '}
            from <TimeAgo at={freshness.since} />
          </>
        ) : null}
        .
      </p>
      {freshness.cause === 'paused' ? null : (
        <Button size="sm" icon="refresh" loading={retrying} onClick={onRetry}>
          Ask the relay
        </Button>
      )}
    </div>
  )
}
