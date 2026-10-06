import type { AppError } from '@/lib'
import { Button, ErrorState, Logo } from '@/ui'
import styles from './RootFallback.module.css'

/**
 * The last line of defence: drawn when the app shell itself crashed. It depends on no router, query client or
 * store, only on the design system and the global styles, so it still renders when everything above it is broken.
 */
export function RootFallback({ error, reset }: { error: AppError; reset: () => void }) {
  return (
    <main className={styles.page}>
      <Logo caption="Field dispatch log" size={32} />
      <h1 className={styles.title}>The app stopped</h1>
      <p className={styles.lead}>The frame that holds every screen crashed while drawing itself. Your drafts are stored on this device and were not touched.</p>
      <ErrorState
        error={error}
        detailOpen
        actions={
          <>
            <Button variant="primary" icon="refresh" onClick={() => window.location.reload()}>
              Reload
            </Button>
            <Button onClick={reset}>Try again without reloading</Button>
          </>
        }
      />
    </main>
  )
}
