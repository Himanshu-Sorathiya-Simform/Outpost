import { registration, startBrowserSync } from './registration'
import { refreshQueuedCount } from './sync'

/** Resolves once the page has finished loading. A worker that precaches files should not compete with the first paint. */
const afterLoad = (): Promise<void> =>
  document.readyState === 'complete' ? Promise.resolve() : new Promise((resolve) => window.addEventListener('load', () => resolve(), { once: true }))

/**
 * Called once from src/main.tsx right after the first render. This is where your PWA work starts.
 *
 * Done: registration.register() and the store that mirrors it (exercise 1); the queued count from the outbox (exercise 11).
 * Still to come:
 *   - capture `beforeinstallprompt` (install.ts, exercise 15)
 *   - read the initial push subscription and periodic tags into usePwaStore (exercises 12, 14)
 *
 * Errors thrown here are reported to Lab → Errors, silently: main.tsx calls boot() through callSeam with `quiet`.
 */
export async function bootPwa(): Promise<void> {
  startBrowserSync()
  await afterLoad()
  await registration.register()
  // The outbox outlives the page, so the QUEUE N count has to be read at start. Storage that cannot be opened leaves the count at 0.
  await refreshQueuedCount().catch(() => undefined)
  // TODO(you): the remaining initial state reads listed above.
}
