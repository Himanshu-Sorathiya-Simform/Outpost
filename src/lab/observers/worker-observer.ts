import { useBridgeLog } from '@/lib/bridge'
import { refCounted } from '@/lib/lifecycle'
import { usePwaStore } from '@/pwa'
import { fingerprint, markWorkerReady, refreshWorkerSnapshot, useWorkerSnapshotStore, type WorkerSnapshot } from './worker-snapshot'
import { pushTimeline, useTimelineStore, type TimelineEvent } from './worker-timeline'

export { refreshWorkerSnapshot } from './worker-snapshot'
export { clearWorkerTimeline, timelineToJson, TIMELINE_CAP, type TimelineEvent, type TimelineKind } from './worker-timeline'
export type { WorkerSnapshot, RegistrationSnapshot, WorkerSlot, Probe, PushSummary } from './worker-snapshot'

/** How often registrations are re-listed. There is no event for "a registration appeared", so this is the only way to see one. */
const POLL_MS = 2000

const pathOf = (url: string): string => {
  try {
    const u = new URL(url)
    return u.origin === location.origin ? `${u.pathname}${u.search}` : url
  } catch {
    return url
  }
}

const messageType = (data: unknown): string => {
  if (typeof data === 'object' && data !== null && 'type' in data && typeof data.type === 'string') return data.type
  return typeof data === 'object' ? '(object without a type)' : `(${typeof data})`
}

/**
 * Watches every service worker registration this page can see and writes the lifecycle into a module-level timeline:
 * updatefound, each worker's statechange, controllerchange, registrations appearing and disappearing, and messages.
 * It only listens. Started once at boot so nothing that happens before the Lab is opened is lost. Idempotent;
 * returns a disposer.
 */
export const startWorkerObserver = refCounted((): (() => void) => {
  if (!('serviceWorker' in navigator)) {
    void refreshWorkerSnapshot()
    return () => undefined
  }
  const container = navigator.serviceWorker
  const watchedWorkers = new WeakSet<ServiceWorker>()
  const watchedRegistrations = new WeakSet<ServiceWorkerRegistration>()
  const knownScopes = new Set<string>()
  let lastPrint = ''
  let firstScan = true
  let scanning = false
  /** A trigger arrived while a scan was in flight: run once more when it ends, or the change it announced is only noticed at the next poll. */
  let rescan = false
  let disposed = false

  const watchWorker = (reg: ServiceWorkerRegistration, worker: ServiceWorker | null, announce: boolean): void => {
    if (!worker || watchedWorkers.has(worker)) return
    watchedWorkers.add(worker)
    const path = pathOf(worker.scriptURL)
    if (announce) pushTimeline({ kind: 'statechange', scope: reg.scope, worker: path, state: worker.state, detail: `${path} is ${worker.state}` })
    worker.addEventListener('statechange', () => {
      pushTimeline({ kind: 'statechange', scope: reg.scope, worker: path, state: worker.state, detail: `${path} is now ${worker.state}` })
      void scan(true)
    })
  }

  const watchRegistration = (reg: ServiceWorkerRegistration): void => {
    watchWorker(reg, reg.installing, !firstScan)
    watchWorker(reg, reg.waiting, false)
    watchWorker(reg, reg.active, false)
    if (watchedRegistrations.has(reg)) return
    watchedRegistrations.add(reg)
    reg.addEventListener('updatefound', () => {
      const incoming = reg.installing
      pushTimeline({ kind: 'updatefound', scope: reg.scope, worker: incoming ? pathOf(incoming.scriptURL) : null, state: null, detail: 'The browser found a worker to install' })
      watchWorker(reg, incoming, true)
      void scan(true)
    })
  }

  /** Lists registrations, logs appearances and disappearances, and does the full read only when something changed. */
  async function scan(force: boolean): Promise<void> {
    if (disposed) return
    if (scanning) {
      rescan = true
      return
    }
    scanning = true
    try {
      const regs = await container.getRegistrations()
      const scopes = new Set(regs.map((r) => r.scope))
      for (const reg of regs) {
        if (!knownScopes.has(reg.scope)) {
          pushTimeline({ kind: 'registration-added', scope: reg.scope, worker: null, state: null, detail: firstScan ? 'Registration already present when the page loaded' : 'New registration' })
        }
        watchRegistration(reg)
      }
      for (const scope of knownScopes) {
        if (!scopes.has(scope)) pushTimeline({ kind: 'registration-removed', scope, worker: null, state: null, detail: 'Registration is gone (unregistered, or site data cleared)' })
      }
      knownScopes.clear()
      scopes.forEach((s) => knownScopes.add(s))
      firstScan = false
      const print = fingerprint(regs, container.controller)
      if (force || print !== lastPrint || useWorkerSnapshotStore.getState().phase === 'loading') {
        lastPrint = print
        await refreshWorkerSnapshot()
      }
    } catch {
      // The snapshot read reports its own failures; a failed listing here just means "try again at the next tick".
      await refreshWorkerSnapshot()
    } finally {
      scanning = false
      if (rescan) {
        rescan = false
        void scan(true)
      }
    }
  }

  pushTimeline({ kind: 'observer-started', scope: null, worker: null, state: null, detail: container.controller ? `Page is controlled by ${pathOf(container.controller.scriptURL)}` : 'Page has no controller' })
  void scan(true)

  void container.ready.then((reg) => {
    if (disposed) return
    markWorkerReady()
    pushTimeline({ kind: 'ready', scope: reg.scope, worker: reg.active ? pathOf(reg.active.scriptURL) : null, state: null, detail: 'navigator.serviceWorker.ready resolved' })
  })

  const onControllerChange = (): void => {
    const next = container.controller
    pushTimeline({ kind: 'controllerchange', scope: null, worker: next ? pathOf(next.scriptURL) : null, state: null, detail: next ? `New controller ${pathOf(next.scriptURL)}` : 'Controller released' })
    void scan(true)
  }
  const onMessage = (e: MessageEvent<unknown>): void => pushTimeline({ kind: 'message', scope: null, worker: null, state: null, detail: `Message from the worker: ${messageType(e.data)}` })
  const onMessageError = (): void => pushTimeline({ kind: 'messageerror', scope: null, worker: null, state: null, detail: 'A message arrived that could not be deserialised' })
  const onWake = (): void => {
    if (document.visibilityState === 'visible') void scan(false)
  }

  container.addEventListener('controllerchange', onControllerChange)
  container.addEventListener('message', onMessage)
  container.addEventListener('messageerror', onMessageError)
  document.addEventListener('visibilitychange', onWake)
  window.addEventListener('focus', onWake)

  // Something in the app just called a registration seam or the boot seam: the state probably moved.
  const stopBridge = useBridgeLog.subscribe((state, prev) => {
    const latest = state.entries[0]
    if (latest && latest !== prev.entries[0] && (latest.feature.startsWith('registration') || latest.feature === 'boot')) void scan(true)
  })
  const stopStore = usePwaStore.subscribe(() => void scan(false))
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') void scan(false)
  }, POLL_MS)

  return () => {
    disposed = true
    clearInterval(timer)
    stopBridge()
    stopStore()
    container.removeEventListener('controllerchange', onControllerChange)
    container.removeEventListener('message', onMessage)
    container.removeEventListener('messageerror', onMessageError)
    document.removeEventListener('visibilitychange', onWake)
    window.removeEventListener('focus', onWake)
  }
})

/** Lifecycle events, newest first. Module-level: the list keeps filling while no Lab page is open. */
export const useWorkerTimeline = (): TimelineEvent[] => useTimelineStore((s) => s.events)

/** What the browser reports right now about registrations, slots and the page's controller. */
export const useWorkerSnapshot = (): WorkerSnapshot => useWorkerSnapshotStore()
