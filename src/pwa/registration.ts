import { notImplemented } from './errors'
import type { PwaApi } from './types'

/**
 * EXERCISE 1 — service worker lifecycle.
 *
 * Suggested steps:
 *  1. Write the worker (e.g. public/sw.js — served from the root so its scope is '/').
 *  2. register(): navigator.serviceWorker.register('/sw.js'); mirror reg.installing / waiting / active
 *     into usePwaStore via setPwa({ registration: ... }).
 *  3. Set updateAvailable = true when a worker is 'installed' while navigator.serviceWorker.controller exists.
 *  4. applyUpdate(): postMessage({ type: 'skip-waiting' }) (see shared/sw-protocol.ts), then reload on 'controllerchange'.
 *  5. Watch Lab → Service Worker while you do all of this.
 *
 * Try to break it: hard-reload (bypasses the SW), open two tabs across an update, serve sw.js with
 * max-age (Lab → Server → Header profile → "http-cache-trap").
 */
export const registration: PwaApi['registration'] = {
  async register() {
    notImplemented('registration.register', 'call navigator.serviceWorker.register() here')
  },
  async unregister() {
    return notImplemented('registration.unregister')
  },
  async checkForUpdate() {
    notImplemented('registration.checkForUpdate', 'registration.update()')
  },
  async applyUpdate() {
    notImplemented('registration.applyUpdate', 'skipWaiting + reload on controllerchange')
  },
}
