import { registration, startBrowserSync } from './registration'
import { notifications } from './notifications'
import { periodicSync } from './periodic-sync'
import { refreshQueuedCount } from './sync'

/** Resolves once the page has finished loading. A worker that precaches files should not compete with the first paint. */
const afterLoad = (): Promise<void> =>
  document.readyState === 'complete' ? Promise.resolve() : new Promise((resolve) => window.addEventListener('load', () => resolve(), { once: true }))

/**
 * Called once from src/main.tsx right after the first render. This is where your PWA work starts.
 *
 * Done: registration.register() and the store that mirrors it (exercise 1); the queued count from the outbox (exercise 11); the push subscription (exercise 12); the periodic sync tags (exercise 14).
 * Still to come:
 *   - capture `beforeinstallprompt` (install.ts, exercise 16)
 *
 * Errors thrown here are reported to Lab → Errors, silently: main.tsx calls boot() through callSeam with `quiet`.
 */
export async function bootPwa(): Promise<void> {
  startBrowserSync()
  await afterLoad()
  await registration.register()
  // The outbox outlives the page, so the QUEUE N count has to be read at start. Storage that cannot be opened leaves the count at 0.
  await refreshQueuedCount().catch(() => undefined)
  // Whether this browser is subscribed to push is the browser's to say, so ask it at start: the Settings card and the store must agree
  // after a reload. A browser without push support leaves it false.
  await notifications.getSubscription().catch(() => undefined)
  // The tags are the browser's to report too, so the Settings switch is right after a reload. Where there is no API the list is empty.
  await periodicSync.list().catch(() => undefined)
}
