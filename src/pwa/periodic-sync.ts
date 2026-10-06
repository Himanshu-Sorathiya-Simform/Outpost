import { notImplemented } from './errors'
import type { PwaApi } from './types'

/**
 * EXERCISE — Periodic Background Sync.
 *  - Chromium only, installed PWAs only, and the browser decides the real interval (site engagement score).
 *  - register(PERIODIC_TAG_DIGEST, ms) → registration.periodicSync.register. Check the 'periodic-background-sync'
 *    permission via navigator.permissions.query first.
 *  - SW `periodicsync` handler: fetch GET /api/digest?since=..., put the items in your cache, update the badge,
 *    maybe showNotification for urgent ones, postMessage({ type: 'periodic-sync-complete', ... }).
 *  - Testing without waiting hours: Chrome DevTools → Application → Service workers → "Periodic Sync" box.
 *  - Lab → Server → Wire can spawn dispatches so the digest has something new.
 *
 * Used by: Settings → Background refresh card.
 */
export const periodicSync: PwaApi['periodicSync'] = {
  isSupported() {
    return typeof ServiceWorkerRegistration !== 'undefined' && 'periodicSync' in ServiceWorkerRegistration.prototype
  },
  async register(_tag, _minIntervalMs) {
    notImplemented('periodicSync.register', 'registration.periodicSync.register(tag, { minInterval })')
  },
  async unregister(_tag) {
    notImplemented('periodicSync.unregister')
  },
  async list() {
    return notImplemented('periodicSync.list', 'registration.periodicSync.getTags()')
  },
}
