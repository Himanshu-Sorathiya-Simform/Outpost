/**
 * Called once from src/main.tsx right after the first render. This is where your PWA work starts.
 *
 * Suggested order:
 *   1. capture `beforeinstallprompt` (install.ts)
 *   2. registration.register()  (registration.ts)
 *   3. read initial state into usePwaStore (push subscription, queued items, periodic tags)
 *
 * Nothing is registered yet, so the site currently behaves like an ordinary website.
 * Errors thrown here are reported to Lab → Errors (kind: 'not-implemented' is expected until you write it).
 */
export async function bootPwa(): Promise<void> {
  // TODO(you): register the service worker and initialise usePwaStore.
}
