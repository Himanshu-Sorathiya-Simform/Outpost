import { useState } from 'react'
import { useLabFeedStore } from '@/lib'
import { Button, Icon } from '@/ui'
import styles from './ServerRestartBanner.module.css'

/**
 * Watches the server instance id. The first id this page sees is the baseline; a different one later (from the
 * polled state or from the live feed's hello) means the process restarted and its in-memory world was re-seeded.
 */
export function ServerRestartBanner({ instance }: { instance: string | undefined }) {
  const feedInstance = useLabFeedStore((s) => s.serverInstance)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)

  const seen = instance ?? feedInstance
  if (baseline === null && seen) setBaseline(seen)

  const current = [instance, feedInstance].find((id): id is string => id != null && id !== baseline) ?? null
  if (baseline === null || current === null || dismissed === current) return null

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <Icon name="warning" size={18} />
      <p className={styles.text}>
        <strong>The server restarted since this page opened.</strong> Instance <code>{baseline}</code> is gone, <code>{current}</code> answers now. Dispatches, sessions and every lab switch were re-seeded; responses this
        browser cached earlier may describe the old instance.
      </p>
      <div className={styles.actions}>
        <Button size="sm" variant="primary" icon="refresh" onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Button size="sm" onClick={() => setDismissed(current)}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}
