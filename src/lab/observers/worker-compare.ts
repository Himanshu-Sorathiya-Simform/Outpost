import type { PwaState } from '@/pwa/store'
import type { Probe, RegistrationSnapshot, WorkerSnapshot } from './worker-snapshot'

export type Verdict = 'match' | 'mismatch' | 'unknown'

export interface CompareRow {
  key: Extract<keyof PwaState, string>
  app: string
  browser: string
  verdict: Verdict
  /** Shown only for a mismatch: where the learner's code probably went wrong. */
  why: string
}

/** The registration that governs this page: the one with the longest scope that contains the URL. */
export function relevantRegistration(snap: WorkerSnapshot): RegistrationSnapshot | undefined {
  const inScope = snap.registrations.filter((r) => location.href.startsWith(r.scope))
  return [...inScope].sort((a, b) => b.scope.length - a.scope.length)[0] ?? snap.registrations[0]
}

/** One word for what the browser says the most recent worker is doing. */
export function browserWorkerState(reg: RegistrationSnapshot | undefined): string {
  if (!reg) return 'none'
  if (reg.installing) return 'installing'
  if (reg.waiting) return 'waiting'
  if (reg.active) return reg.active.state === 'activated' ? 'active' : reg.active.state
  return 'none'
}

const probed = <T>(probe: Probe<T> | undefined): T | undefined => (probe?.status === 'ok' ? probe.value : undefined)

function row(key: Extract<keyof PwaState, string>, app: string, browser: string | null, why: string, agree?: boolean): CompareRow {
  if (browser === null) return { key, app, browser: 'cannot be read', verdict: 'unknown', why: '' }
  const same = agree ?? app === browser
  return { key, app, browser, verdict: same ? 'match' : 'mismatch', why: same ? '' : why }
}

/** Does the app's free-text swState describe what the browser reports? 'activated', 'active', 'sw active' all mean active. */
function stateAgrees(app: string, browser: string): boolean {
  const text = app.toLowerCase()
  if (browser === 'none') return text === 'none' || text === ''
  if (browser === 'active') return text.includes('activ') && !text.includes('activating')
  if (browser === 'waiting') return text.includes('wait') || text.includes('installed')
  return text.includes(browser)
}

export function compareSources(app: PwaState, snap: WorkerSnapshot, standaloneNow: boolean, notification: string): CompareRow[] {
  const reg = relevantRegistration(snap)
  const supported = snap.phase !== 'unsupported'
  const loaded = snap.phase === 'ready'
  const state = browserWorkerState(reg)
  const push = probed(reg?.push)
  const periodic = probed(reg?.periodicTags)
  return [
    row(
      'swRegistered',
      String(app.swRegistered),
      loaded || !supported ? String(reg !== undefined) : null,
      app.swRegistered
        ? 'The store says a worker is registered; the browser lists none for this page. Did register() reject, or unregister() run without resetting the store?'
        : 'The browser has a registration and the store never heard about it. Did register() skip setPwa({ swRegistered: true }), or does a reload lose it because boot() only sets it on a first install?',
    ),
    row(
      'swState',
      app.swState,
      loaded || !supported ? state : null,
      `The store says "${app.swState}"; the browser says the newest worker is ${state}. Is swState updated on every statechange, or only once at register()?`,
      loaded || !supported ? stateAgrees(app.swState, state) : undefined,
    ),
    row(
      'updateAvailable',
      String(app.updateAvailable),
      loaded ? String(Boolean(reg?.waiting) && snap.controller !== null) : null,
      app.updateAvailable
        ? 'The store flags an update but nothing is waiting behind a controlled page. Was the flag left on after the new worker activated, or set on first install (no controller yet)?'
        : 'A worker is waiting and the page is controlled, yet the update toast is off. Is updatefound handled, and does it look at the installed state rather than only installing?',
    ),
    row(
      'pushSubscribed',
      String(app.pushSubscribed),
      loaded && push !== undefined ? String(push !== null) : null,
      app.pushSubscribed
        ? 'The store says subscribed; pushManager has no subscription. The server may have pruned it after a 410, or the browser dropped it when permission was reset.'
        : 'pushManager holds a subscription the store does not know about. Is the subscription read back into the store at boot?',
    ),
    row(
      'notificationPermission',
      app.notificationPermission,
      typeof Notification === 'undefined' ? 'unsupported' : notification,
      'The store copy of the permission is stale. The user can change it in browser settings at any time, with no event for the page; re-read it on focus.',
    ),
    row(
      'periodicTags',
      app.periodicTags.length === 0 ? 'none' : [...app.periodicTags].sort().join(', '),
      loaded && periodic !== undefined ? (periodic.length === 0 ? 'none' : [...periodic].sort().join(', ')) : null,
      'The tags in the store differ from registration.periodicSync.getTags(). Was the list refreshed after register() and unregister()?',
    ),
    row('standalone', String(app.standalone), String(standaloneNow), 'The store and the display-mode media query disagree. The store is meant to follow the query through its change listener.'),
  ]
}
