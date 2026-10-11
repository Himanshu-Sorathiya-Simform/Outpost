import { findRegistration } from './registration'
import { setPwa } from './store'
import type { PwaApi } from './types'

/** The Periodic Background Sync manager of a registration. Chromium only, and TypeScript's DOM library may not describe it. */
interface PeriodicSyncManager {
  register(tag: string, options: { minInterval: number }): Promise<void>
  unregister(tag: string): Promise<void>
  getTags(): Promise<string[]>
}
type WithPeriodicSync = ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }

const supported = (): boolean => typeof ServiceWorkerRegistration !== 'undefined' && 'periodicSync' in ServiceWorkerRegistration.prototype

/** The manager of the registration that governs this page, or null: no registration, or a browser without the API. */
async function managerOf(): Promise<PeriodicSyncManager | null> {
  if (!supported()) return null
  return ((await findRegistration()) as WithPeriodicSync | undefined)?.periodicSync ?? null
}

/** Asks the browser which tags are registered and puts them in the store, so Settings and the Lab agree with the browser. */
async function readTags(manager: PeriodicSyncManager | null): Promise<string[]> {
  const tags = manager ? await manager.getTags() : []
  setPwa({ periodicTags: tags })
  return tags
}

/**
 * EXERCISE 14 — Periodic Background Sync.
 *  - Chromium only, installed PWAs only, and the browser decides the real interval (site engagement). `minInterval` is a request.
 *  - register(tag, ms): refuses with NotSupportedError where there is no API; asks the 'periodic-background-sync' permission first and
 *    refuses with NotAllowedError when it is not granted (a tab that is not an installed app); then
 *    registration.periodicSync.register(tag, { minInterval }). Every call ends by reading getTags() into the store, so `periodicTags`
 *    is what the browser says and not what this page believes.
 *  - The worker's `periodicsync` handler (src/sw/periodic-sync.ts) fetches GET /api/digest?since=..., keeps it, sets the badge and tells the pages.
 *  - Testing without waiting hours: Chrome DevTools -> Application -> Service workers -> "Periodic Sync" box, tag `digest-refresh`.
 *  - Lab -> Server -> Wire can spawn dispatches so the digest has something new.
 *
 * Used by: Settings -> Background refresh card.
 */
export const periodicSync: PwaApi['periodicSync'] = {
  isSupported: supported,

  async register(tag, minIntervalMs) {
    const manager = await managerOf()
    if (!supported()) throw new DOMException('This browser has no Periodic Background Sync.', 'NotSupportedError')
    if (!manager) throw new DOMException('No service worker is registered, so there is nothing to wake.', 'InvalidStateError')
    try {
      const permission = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName })
      if (permission.state !== 'granted') throw new DOMException('The browser has not granted periodic background sync to this site. It usually needs an installed app.', 'NotAllowedError')
    } catch (error) {
      // A refusal is the answer. A browser that cannot even answer the query is left to decide in register() below.
      if (error instanceof DOMException && error.name === 'NotAllowedError') throw error
    }
    await manager.register(tag, { minInterval: minIntervalMs })
    await readTags(manager)
  },

  async unregister(tag) {
    const manager = await managerOf()
    // Nothing can be registered where there is no API, so there is nothing to remove.
    if (manager) await manager.unregister(tag)
    await readTags(manager)
  },

  async list() {
    return readTags(await managerOf())
  },
}
