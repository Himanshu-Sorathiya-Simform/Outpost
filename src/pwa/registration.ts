import { setPwa } from './store'
import { describeSlots } from './sw-state'
import type { PwaApi } from './types'

/** Served from the site root, so the default scope is '/' and the worker can control every route. */
const SCRIPT_URL = '/sw.js'

const watchedRegistrations = new WeakSet<ServiceWorkerRegistration>()
const watchedWorkers = new WeakSet<ServiceWorker>()
let browserSyncStarted = false
const watchedContainers = new WeakSet<ServiceWorkerContainer>()

/** A tab reloads for a controller change at most once in this long, so a worker that takes over on every load (DevTools "Update on reload") cannot loop. */
const RELOAD_GUARD_MS = 10_000
const RELOAD_GUARD_KEY = 'outpost-sw-reloaded-at'

const supported = (): boolean => typeof navigator !== 'undefined' && 'serviceWorker' in navigator

/**
 * Copies what the browser says about one registration into usePwaStore. `undefined` means there is none.
 *
 * `updateAvailable` is worked out here, from the registration, every time, and not set by an event: a worker is waiting AND this page is
 * controlled by another one. That one rule covers a page that opens with a worker already waiting, a waiting worker that is replaced by a
 * newer one, and the flag going back to false when the waiting worker takes over (the slot empties). Without a controller a waiting worker is
 * a first install, not an update.
 */
function mirror(reg: ServiceWorkerRegistration | undefined): void {
  if (!reg) setPwa({ swRegistered: false, swState: 'none', updateAvailable: false })
  else setPwa({ swRegistered: true, swState: describeSlots(reg), updateAvailable: Boolean(reg.waiting && navigator.serviceWorker.controller) })
}

/** True when this tab already reloaded for a controller change a moment ago. Storage that cannot be read counts as "no", and the module flag still stops a second reload. */
function reloadedRecently(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_GUARD_KEY))
    return Number.isFinite(at) && Date.now() - at < RELOAD_GUARD_MS
  } catch {
    return false
  }
}

/**
 * Follows which worker controls this page. When the controller CHANGES from one worker to another (an update took over), the page reloads,
 * so it runs the code the new worker serves and not the old build's. Every tab that was controlled does this, not only the one that pressed
 * Update; Compose drafts autosave after 600 ms, so a reload costs at most the last half second of typing. No reload when:
 *   - there was no controller before: the first install claimed the page, which is not an update;
 *   - there is none now: the worker was unregistered;
 *   - this tab already reloaded (the module flag), or did a moment ago (the session guard: "Update on reload" takes over on every load).
 * The flag is mirrored again, because it depends on the controller.
 */
function watchController(): void {
  if (!supported() || watchedContainers.has(navigator.serviceWorker)) return
  const container = navigator.serviceWorker
  watchedContainers.add(container)
  let previous = container.controller
  let reloading = false
  container.addEventListener('controllerchange', () => {
    const was = previous
    previous = container.controller
    void syncFromBrowser()
    if (!was || !container.controller || reloading || reloadedRecently()) return
    reloading = true
    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
    } catch {
      // the module flag alone still guards this page's life
    }
    location.reload()
  })
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
  watchController()
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
  watchController()
  const onWake = (): void => {
    if (document.visibilityState === 'visible') void syncFromBrowser()
  }
  document.addEventListener('visibilitychange', onWake)
  window.addEventListener('focus', onWake)
}

/**
 * EXERCISE 1 — service worker lifecycle.
 *
 * register, unregister, checkForUpdate and applyUpdate are written; the updateAvailable flag is worked out in mirror(), and the reload
 * on controllerchange is in watchController().
 *
 * The update flow: the browser finds new bytes in sw.js and installs the new worker, which waits (the worker has no skipWaiting). mirror()
 * sees a worker waiting while this page is controlled and raises updateAvailable, which shows the "Update ready" toast. applyUpdate() posts
 * { type: 'skip-waiting' } to registration.waiting; the worker activates and claims, controllerchange fires in every tab, each reloads once.
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
    if (!supported()) throw new DOMException('This browser has no service worker API.', 'NotSupportedError')
    const reg = await findRegistration()
    // The message goes to the WAITING worker. The controller is the old worker, and skipWaiting() on it does nothing.
    if (!reg?.waiting) throw new DOMException('No new worker is waiting, so there is nothing to apply.', 'InvalidStateError')
    reg.waiting.postMessage({ type: 'skip-waiting' })
  },
}
