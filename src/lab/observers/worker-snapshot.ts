import { create } from 'zustand'
import type { AppError } from '@/lib/errors/app-error'
import { toAppError } from '@/lib/errors/normalize'

export interface WorkerSlot {
  state: ServiceWorkerState
  scriptURL: string
}

/** One optional browser API read: it answered, the browser lacks it, or it threw. */
export type Probe<T> = { status: 'ok'; value: T } | { status: 'unsupported'; reason: string } | { status: 'error'; message: string }

export interface PushSummary {
  /** The last 12 characters of the endpoint: enough to tell subscriptions apart, not enough to be a secret. */
  endpointTail: string
  expiresAt: number | null
}

export interface RegistrationSnapshot {
  scope: string
  updateViaCache: ServiceWorkerUpdateViaCache
  installing: WorkerSlot | null
  waiting: WorkerSlot | null
  active: WorkerSlot | null
  navigationPreload: Probe<{ enabled: boolean; headerValue: string }>
  push: Probe<PushSummary | null>
  syncTags: Probe<string[]>
  periodicTags: Probe<string[]>
  /** This page is inside the scope and the page's controller is this registration's active worker. */
  controlsPage: boolean
}

export interface WorkerSnapshot {
  phase: 'loading' | 'ready' | 'error' | 'unsupported'
  /** Why the API is missing, for phase 'unsupported'. */
  unsupportedReason: string | null
  error: AppError | null
  readAt: number | null
  controller: WorkerSlot | null
  /** navigator.serviceWorker.ready: it only resolves once some registration has an active worker. */
  ready: 'pending' | 'resolved'
  registrations: RegistrationSnapshot[]
}

export const useWorkerSnapshotStore = create<WorkerSnapshot>(() => ({
  phase: 'loading',
  unsupportedReason: null,
  error: null,
  readAt: null,
  controller: null,
  ready: 'pending',
  registrations: [],
}))

const slotOf = (worker: ServiceWorker | null): WorkerSlot | null => (worker ? { state: worker.state, scriptURL: worker.scriptURL } : null)

export function unsupportedReason(): string | null {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) return null
  return typeof isSecureContext === 'boolean' && !isSecureContext
    ? `Service workers are hidden on insecure origins. ${location.origin} is neither HTTPS nor localhost.`
    : 'This browser does not expose navigator.serviceWorker (private modes of some browsers also hide it).'
}

interface TagSource {
  getTags(): Promise<string[]>
}

function tagSource(reg: ServiceWorkerRegistration, key: 'sync' | 'periodicSync'): TagSource | null {
  const candidate: unknown = Reflect.get(reg, key)
  if (typeof candidate === 'object' && candidate !== null && 'getTags' in candidate && typeof candidate.getTags === 'function') return candidate as TagSource
  return null
}

async function probe<T>(missing: string, run: (() => Promise<T>) | null): Promise<Probe<T>> {
  if (!run) return { status: 'unsupported', reason: missing }
  try {
    return { status: 'ok', value: await run() }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

async function readRegistration(reg: ServiceWorkerRegistration, controller: ServiceWorker | null): Promise<RegistrationSnapshot> {
  const preload = reg.navigationPreload
  const sync = tagSource(reg, 'sync')
  const periodic = tagSource(reg, 'periodicSync')
  const [navigationPreload, push, syncTags, periodicTags] = await Promise.all([
    probe('navigationPreload is not on this registration (Chromium and Firefox have it, Safari does not as far as we know).', preload ? async () => {
      const state = await preload.getState()
      return { enabled: state.enabled ?? false, headerValue: state.headerValue ?? '' }
    } : null),
    probe('pushManager is missing: no Push API here, or the page is not a secure context.', reg.pushManager ? async () => {
      const sub = await reg.pushManager.getSubscription()
      return sub ? { endpointTail: sub.endpoint.slice(-12), expiresAt: sub.expirationTime } : null
    } : null),
    probe('registration.sync is missing: Background Sync is Chromium only.', sync ? () => sync.getTags() : null),
    probe('registration.periodicSync is missing: Periodic Background Sync is Chromium only, installed apps only.', periodic ? () => periodic.getTags() : null),
  ])
  const active = slotOf(reg.active)
  return {
    scope: reg.scope,
    updateViaCache: reg.updateViaCache,
    installing: slotOf(reg.installing),
    waiting: slotOf(reg.waiting),
    active,
    navigationPreload,
    push,
    syncTags,
    periodicTags,
    controlsPage: controller !== null && active?.scriptURL === controller.scriptURL && location.href.startsWith(reg.scope),
  }
}

/** Reads every registration and the page's controller into the store. Safe to call at any time; never throws. */
export async function refreshWorkerSnapshot(): Promise<void> {
  const reason = unsupportedReason()
  if (reason !== null) {
    useWorkerSnapshotStore.setState({ phase: 'unsupported', unsupportedReason: reason, readAt: Date.now(), registrations: [], controller: null })
    return
  }
  try {
    const controller = navigator.serviceWorker.controller
    const regs = await navigator.serviceWorker.getRegistrations()
    const registrations = await Promise.all(regs.map((reg) => readRegistration(reg, controller)))
    useWorkerSnapshotStore.setState({ phase: 'ready', error: null, readAt: Date.now(), controller: slotOf(controller), registrations })
  } catch (err) {
    useWorkerSnapshotStore.setState({ phase: 'error', error: toAppError(err, { source: 'lab:worker-snapshot' }), readAt: Date.now() })
  }
}

export const markWorkerReady = (): void => useWorkerSnapshotStore.setState({ ready: 'resolved' })

/** A string that changes whenever a registration or a slot changes, so a poll can skip the expensive read. */
export function fingerprint(regs: readonly ServiceWorkerRegistration[], controller: ServiceWorker | null): string {
  const slot = (w: ServiceWorker | null): string => (w ? `${w.state}@${w.scriptURL}` : '-')
  return [controller?.scriptURL ?? 'no-controller', ...regs.map((r) => [r.scope, r.updateViaCache, slot(r.installing), slot(r.waiting), slot(r.active)].join('|'))].join('\n')
}
