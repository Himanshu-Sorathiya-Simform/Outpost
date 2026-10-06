import type { QueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { API } from '@shared/contracts'
import { parseSwMessage, SW_BROADCAST_CHANNEL, type PageToSw, type SwToPage } from '@shared/sw-protocol'
import { errorCenter } from '@/lib/errors/center'
import { refCounted } from '@/lib/lifecycle'
import { notify } from '@/lib/notify'
import { queryClient } from '@/lib/query/client'
import { pwa, setPwa } from '@/pwa'
import { callSeam } from './seam'

export const SW_MESSAGE_RING_SIZE = 100

export type SwMessageChannel = 'service-worker' | 'broadcast-channel' | 'page'

/** One message crossing the page/service-worker boundary, in either direction. */
export interface SwMessageLogEntry {
  id: number
  at: number
  direction: 'in' | 'out'
  channel: SwMessageChannel
  /** The `type` field when the payload has a string one; otherwise null. */
  type: string | null
  /** The payload exactly as received (or sent). Invalid messages are kept too. */
  raw: unknown
  valid: boolean
  /** Why it was rejected: the zod issues for an invalid message. */
  reason: string | null
  /** What the app did about it: 'invalidated 2 queries', 'ignored: cross-origin URL', 'no controller', ... */
  note: string | null
}

interface SwMessageLogState {
  /** Newest first. */
  entries: SwMessageLogEntry[]
  record(entry: Omit<SwMessageLogEntry, 'id' | 'at'>): void
  clear(): void
}

let seq = 0

export const useSwMessageLog = create<SwMessageLogState>((set) => ({
  entries: [],
  record: (entry) => set((s) => ({ entries: [{ ...entry, id: ++seq, at: Date.now() }, ...s.entries].slice(0, SW_MESSAGE_RING_SIZE) })),
  clear: () => set({ entries: [] }),
}))

// ─── URL matching ─────────────────────────────────────────────────────────────

const pathnameOf = (url: string): string | null => {
  try {
    // The base only lets relative paths parse; absolute URLs keep their own pathname.
    return new URL(url, 'http://outpost.invalid').pathname
  } catch {
    return null
  }
}

/**
 * Does a query (identified by the `meta.url` it was registered with) depend on the resource the worker reported?
 * Compared on pathname only. Equal paths match, and the worker's URL also acts as a prefix on a segment boundary
 * ('/api/dispatches' covers '/api/dispatches/dp-000123').
 */
export function urlMatches(queryUrl: unknown, swUrl: string): boolean {
  if (typeof queryUrl !== 'string') return false
  const q = withoutTrailingSlash(pathnameOf(queryUrl))
  const s = withoutTrailingSlash(pathnameOf(swUrl))
  if (q === null || s === null) return false
  // The root is the app shell, not an ancestor of the API: '/' only ever matches itself.
  return q === s || (s !== '/' && q.startsWith(`${s}/`))
}

function withoutTrailingSlash(path: string | null): string | null {
  return path !== null && path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/**
 * Only same-origin targets, returned as path + query + hash. A worker message must not be able to send the app elsewhere.
 * The parser resolves dot segments after the origin check, so '/.//host' comes out as the path '//host', which a
 * router or history.pushState would read as a protocol-relative URL. Leading slashes are collapsed to one.
 */
export function safeNavigationTarget(url: string, origin: string = location.origin): string | null {
  try {
    const target = new URL(url, origin)
    if (target.origin !== origin) return null
    return `${target.pathname.replace(/^\/{2,}/, '/')}${target.search}${target.hash}`
  } catch {
    return null
  }
}

// ─── reactions ────────────────────────────────────────────────────────────────

export interface BridgeDeps {
  navigate: (to: string) => void
  queryClient: Pick<QueryClient, 'invalidateQueries' | 'getQueryCache'>
}

function invalidateMatching(client: BridgeDeps['queryClient'], prefixes: readonly string[]): string {
  const predicate = (q: { meta?: Record<string, unknown> }): boolean => prefixes.some((p) => urlMatches(q.meta?.url, p))
  const count = client.getQueryCache().findAll({ predicate }).length
  void client.invalidateQueries({ predicate })
  return `invalidated ${count} ${count === 1 ? 'query' : 'queries'}`
}

function react(message: SwToPage, deps: BridgeDeps): string | null {
  switch (message.type) {
    case 'cache-updated':
      return invalidateMatching(deps.queryClient, [message.url])

    case 'sync-complete': {
      const note = invalidateMatching(deps.queryClient, [API.dispatches, API.inbox])
      void callSeam('sync.listQueued', () => pwa.sync.listQueued(), { quiet: true })
        .then((queued) => {
          if (queued) setPwa({ queuedCount: queued.length })
        })
        .catch(() => undefined) // already in the bridge log and the error centre
      const { succeeded, failed } = message
      if (succeeded.length > 0 || failed.length > 0) {
        notify({
          key: 'sync-complete',
          tone: failed.length > 0 ? 'warn' : 'ok',
          title: failed.length > 0 ? 'Outbox partly sent' : 'Outbox sent',
          message: `${succeeded.length} filed, ${failed.length} still waiting.`,
        })
      }
      return note
    }

    case 'periodic-sync-complete':
      return invalidateMatching(deps.queryClient, [API.digest, API.inbox])

    case 'navigate': {
      const target = safeNavigationTarget(message.url)
      if (target === null) return `navigation ignored: "${message.url}" is not a same-origin URL`
      deps.navigate(target)
      return `navigated to ${target}`
    }

    case 'push-received': {
      const { payload } = message
      const note = invalidateMatching(deps.queryClient, [API.inbox])
      if (payload.silent) return `${note}; silent push, no toast`
      const target = safeNavigationTarget(payload.url)
      notify({
        key: 'push-received',
        title: payload.title,
        message: payload.body,
        action: target === null ? undefined : { label: 'Open', run: () => deps.navigate(target) },
      })
      return `${note}; toast shown`
    }

    case 'sw-version':
    case 'log':
      return null
  }
}

const typeOf = (data: unknown): string | null =>
  typeof data === 'object' && data !== null && typeof (data as { type?: unknown }).type === 'string' ? (data as { type: string }).type : null

/** Validates, logs and reacts to one raw message. Never throws: a broken reaction must not kill the listener. */
export function handleSwMessage(data: unknown, channel: SwMessageChannel, deps: BridgeDeps): void {
  const log = useSwMessageLog.getState().record
  const type = typeOf(data)
  const parsed = parseSwMessage(data)
  if (!parsed.ok) {
    log({ direction: 'in', channel, type, raw: data, valid: false, reason: parsed.reason, note: null })
    return
  }
  let note: string | null
  try {
    note = react(parsed.message, deps)
  } catch (err) {
    errorCenter.report(err, { source: `sw-message:${parsed.message.type}` })
    note = 'reaction failed, see the error centre'
  }
  log({ direction: 'in', channel, type, raw: data, valid: true, reason: null, note })
}

/**
 * Posts a message to the service worker that controls this page. Returns false (and logs why) when there is no
 * controller: the page was force-reloaded, the worker is not registered yet, or this browser has no service workers.
 */
export function sendToSw(message: PageToSw): boolean {
  const log = useSwMessageLog.getState().record
  const base = { direction: 'out', channel: 'page', type: message.type, raw: message, valid: true, reason: null } as const
  const controller = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker.controller : null
  if (!controller) {
    log({ ...base, note: 'not sent: no controlling service worker' })
    return false
  }
  try {
    controller.postMessage(message)
  } catch (err) {
    errorCenter.report(err, { source: `sw-message:send:${message.type}`, silent: true })
    log({ ...base, note: 'not sent: postMessage threw' })
    return false
  }
  log({ ...base, note: null })
  return true
}

/**
 * Listens for service worker messages on navigator.serviceWorker and on the optional 'outpost-sw' BroadcastChannel.
 * Idempotent; returns a disposer. `navigate` is the router's navigate function.
 */
export const startSwMessageBridge = refCounted(({ navigate }: { navigate: (to: string) => void }): (() => void) => {
  const deps: BridgeDeps = { navigate, queryClient }
  const disposers: Array<() => void> = []

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const container = navigator.serviceWorker
    const onMessage = (e: MessageEvent<unknown>): void => handleSwMessage(e.data, 'service-worker', deps)
    const onMessageError = (): void => {
      useSwMessageLog.getState().record({ direction: 'in', channel: 'service-worker', type: null, raw: null, valid: false, reason: 'messageerror: the payload could not be deserialised', note: null })
    }
    container.addEventListener('message', onMessage)
    container.addEventListener('messageerror', onMessageError)
    // Messages are queued until the page opts in; addEventListener alone does not. Older engines lack the method.
    if (typeof container.startMessages === 'function') container.startMessages()
    disposers.push(() => {
      container.removeEventListener('message', onMessage)
      container.removeEventListener('messageerror', onMessageError)
    })
  }

  if (typeof BroadcastChannel === 'function') {
    try {
      const channel = new BroadcastChannel(SW_BROADCAST_CHANNEL)
      channel.onmessage = (e: MessageEvent<unknown>) => handleSwMessage(e.data, 'broadcast-channel', deps)
      disposers.push(() => channel.close())
    } catch (err) {
      // The channel is optional: the worker's own postMessage path keeps working without it.
      errorCenter.report(err, { source: 'sw-bridge:broadcast-channel', silent: true })
    }
  }

  return () => disposers.forEach((dispose) => dispose())
})
