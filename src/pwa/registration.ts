import { notImplemented } from './errors'
import { setPwa } from './store'
import { describeSlots } from './sw-state'
import type { PwaApi } from './types'

/** Served from the site root, so the default scope is '/' and the worker can control every route. */
const SCRIPT_URL = '/sw.js'

const watchedRegistrations = new WeakSet<ServiceWorkerRegistration>()
const watchedWorkers = new WeakSet<ServiceWorker>()
let browserSyncStarted = false

const supported = (): boolean => typeof navigator !== 'undefined' && 'serviceWorker' in navigator

/** Copies what the browser says about one registration into usePwaStore. `undefined` means there is none. */
function mirror(reg: ServiceWorkerRegistration | undefined): void {
  if (!reg) setPwa({ swRegistered: false, swState: 'none' })
  else setPwa({ swRegistered: true, swState: describeSlots(reg) })
}

/**
 * The registration that governs this page: the longest scope containing the URL, else any. Lab → Worker picks the same one.
 * It asks the browser each time instead of remembering the object from register(): a reload empties module variables,
 * and the registration outlives the page.
 */
async function findRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  const regs = await navigator.serviceWorker.getRegistrations()
  const inScope = regs.filter((r) => location.href.startsWith(r.scope))
  return [...inScope].sort((a, b) => b.scope.length - a.scope.length)[0] ?? regs[0]
}

/** Follows a registration for as long as the page lives. Safe to call again for the same one: nothing is attached twice. */
function watch(reg: ServiceWorkerRegistration): void {
  const watchWorker = (worker: ServiceWorker | null): void => {
    if (!worker || watchedWorkers.has(worker)) return
    watchedWorkers.add(worker)
    worker.addEventListener('statechange', () => {
      mirror(reg)
      // A worker that fails to install becomes redundant, and a first install that fails takes the registration with it.
      // The slots then say nothing, so ask the browser whether the registration still exists.
      if (worker.state === 'redundant') void syncFromBrowser()
    })
  }
  const attach = (): void => {
    watchWorker(reg.installing)
    watchWorker(reg.waiting)
    watchWorker(reg.active)
  }
  if (!watchedRegistrations.has(reg)) {
    watchedRegistrations.add(reg)
    // A new worker appears in the installing slot only after this fires, so its statechange listener has to be added here.
    reg.addEventListener('updatefound', () => {
      attach()
      mirror(reg)
    })
  }
  attach()
  mirror(reg)
}

/** Re-reads the registration from the browser into the store. For the cases that raise no event: DevTools Unregister, site data cleared. */
export async function syncFromBrowser(): Promise<void> {
  if (!supported()) return
  try {
    const reg = await findRegistration()
    if (reg) watch(reg)
    else mirror(undefined)
  } catch {
    // getRegistrations() can reject in a detached or restricted document. The store keeps its last value; the next focus tries again.
  }
}

/** Keeps the store honest about changes the browser makes without telling the page. Idempotent. Called from boot(). */
export function startBrowserSync(): void {
  if (browserSyncStarted || typeof document === 'undefined') return
  browserSyncStarted = true
  const onWake = (): void => {
    if (document.visibilityState === 'visible') void syncFromBrowser()
  }
  document.addEventListener('visibilitychange', onWake)
  window.addEventListener('focus', onWake)
}

/**
 * EXERCISE 1 — service worker lifecycle.
 *
 * register, unregister and checkForUpdate are written. applyUpdate and the updateAvailable flag belong to exercise 10.
 *
 * Try to break it: hard-reload (bypasses the SW), open two tabs across an update, serve sw.js with
 * max-age (Lab → Server → Header profile → "http-cache-trap").
 */
export const registration: PwaApi['registration'] = {
  async register() {
    // No API (insecure origin, some private modes): the site stays an ordinary website, and the store stays at 'none'.
    if (!supported()) return
    try {
      watch(await navigator.serviceWorker.register(SCRIPT_URL))
    } catch (error) {
      // A rejected register() can still leave an older registration behind, so report what the browser has, not a guess.
      await syncFromBrowser()
      throw error
    }
  },
  async unregister() {
    if (!supported()) return false
    const reg = await findRegistration()
    if (!reg) {
      mirror(undefined)
      return false
    }
    const removed = await reg.unregister()
    // The page keeps its controller until it reloads, but the registration is gone as far as getRegistrations() is concerned.
    mirror(undefined)
    return removed
  },
  async checkForUpdate() {
    if (!supported()) throw new DOMException('This browser has no service worker API.', 'NotSupportedError')
    const reg = await findRegistration()
    if (!reg) throw new DOMException('No service worker is registered, so there is nothing to update.', 'InvalidStateError')
    try {
      await reg.update()
    } catch (error) {
      // update() rejects with a bare TypeError when the script cannot be fetched (server down, offline, 404). The page files an
      // unrecognised TypeError as 'unknown'; a NetworkError DOMException is the name it classifies as 'network', and keeps the browser's text.
      if (error instanceof TypeError) throw new DOMException(error.message, 'NetworkError')
      throw error
    }
    watch(reg)
  },
  async applyUpdate() {
    notImplemented('registration.applyUpdate', 'exercise 10: skipWaiting + reload on controllerchange')
  },
}
