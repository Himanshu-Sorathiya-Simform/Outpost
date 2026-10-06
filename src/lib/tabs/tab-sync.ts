import { create } from 'zustand'
import { z } from 'zod'
import { errorCenter } from '@/lib/errors/center'
import { refCounted } from '@/lib/lifecycle'
import { queryClient } from '@/lib/query/client'
import { useAppSettings } from '@/lib/settings/app-settings'
import { getLabSettings, useLabSettings } from '@/lib/settings/lab-settings'
import { safeLocal, safeSession } from '@/lib/storage/safe'

export const TAB_CHANNEL = 'outpost-tabs'
export const PRESENCE_EVERY_MS = 5000
export const PRESENCE_TTL_MS = 12_000
const PRUNE_EVERY_MS = 2000
const TAB_ID_KEY = 'outpost.tabId'
/** localStorage key used as a message bus when BroadcastChannel is missing: a `storage` event fires in every OTHER tab. */
const FALLBACK_KEY = 'outpost.tabs.msg'

// ─── identity ────────────────────────────────────────────────────────────────
let cachedTabId: string | null = null

/**
 * This tab's id. Kept in sessionStorage so a reload keeps it (a duplicated tab copies sessionStorage, so two tabs
 * can briefly share an id; presence treats the later one as a refresh of the same tab, which is harmless here).
 */
export function getTabId(): string {
  if (cachedTabId) return cachedTabId
  const stored = safeSession.get(TAB_ID_KEY)
  if (stored) {
    cachedTabId = stored
    return stored
  }
  const created = `tab-${randomHex(4)}`
  safeSession.set(TAB_ID_KEY, created)
  cachedTabId = created
  return created
}

/** crypto.randomUUID only exists in secure contexts; this app is also opened over plain http on a LAN address. */
function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Replaces this tab's id. Used when a second document turns out to share it. */
export function rotateTabId(): string {
  cachedTabId = null
  safeSession.remove(TAB_ID_KEY)
  return getTabId()
}

// ─── wire format (validated: anything in the same origin can post here) ───────
const TabPresence = z.object({
  tabId: z.string(),
  version: z.string(),
  buildId: z.string(),
  controller: z.string().nullable(),
  visibility: z.enum(['visible', 'hidden']),
  at: z.number(),
})
export type TabPresence = z.infer<typeof TabPresence>

const TabMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('invalidate'), key: z.array(z.unknown()) }),
  z.object({ type: z.literal('session-changed') }),
  z.object({ type: z.literal('settings-changed'), scope: z.enum(['app', 'lab']) }),
  z.object({ type: z.literal('presence'), tab: TabPresence }),
])
export type TabMessage = z.infer<typeof TabMessage>

const Wire = z.object({ from: z.string(), msg: TabMessage })

// ─── presence store ──────────────────────────────────────────────────────────
export interface OpenTab extends TabPresence {
  /** Receiver's clock when the last heartbeat arrived. Expiry uses this, so clock skew between tabs is irrelevant. */
  seenAt: number
  self: boolean
}

interface TabState {
  /** This tab first, then the others by most recent heartbeat. */
  tabs: OpenTab[]
}

const useTabStore = create<TabState>(() => ({ tabs: [] }))

/** Every tab of this app that has announced itself within the last 12 s, this one included. */
export const useOpenTabs = (): OpenTab[] => useTabStore((s) => s.tabs)

/** Non-React read of the same list. */
export const getOpenTabs = (): OpenTab[] => useTabStore.getState().tabs

const order = (tabs: OpenTab[]): OpenTab[] => [...tabs].sort((a, b) => Number(b.self) - Number(a.self) || b.seenAt - a.seenAt)

export function applyPresence(tab: TabPresence, self: boolean, now: number = Date.now()): boolean {
  const { tabs } = useTabStore.getState()
  const isNew = !tabs.some((t) => t.tabId === tab.tabId)
  // There is only one "this tab": when the id was rotated, the row under the old id goes.
  const others = tabs.filter((t) => t.tabId !== tab.tabId && !(self && t.self))
  useTabStore.setState({ tabs: order([...others, { ...tab, seenAt: now, self }]) })
  return isNew
}

/** Drops tabs that stopped announcing themselves. Returns how many went. */
export function pruneTabs(now: number = Date.now()): number {
  const { tabs } = useTabStore.getState()
  const alive = tabs.filter((t) => t.self || now - t.seenAt <= PRESENCE_TTL_MS)
  if (alive.length !== tabs.length) useTabStore.setState({ tabs: alive })
  return tabs.length - alive.length
}

export function resetOpenTabs(): void {
  useTabStore.setState({ tabs: [] })
}

function currentPresence(): TabPresence {
  return {
    tabId: getTabId(),
    version: __APP_VERSION__,
    buildId: __BUILD_ID__,
    // `navigator.serviceWorker` can be present but undefined (Firefox private windows), hence the optional chain.
    controller: typeof navigator !== 'undefined' ? (navigator.serviceWorker?.controller?.scriptURL ?? null) : null,
    visibility: document.visibilityState === 'visible' ? 'visible' : 'hidden',
    at: Date.now(),
  }
}

// ─── transport ───────────────────────────────────────────────────────────────
interface Transport {
  post(message: TabMessage): void
  close(): void
}

let transport: Transport | null = null
/** True while applying another tab's settings so the store subscription does not echo them straight back. */
let applyingRemote = false

function openTransport(onRaw: (raw: unknown) => void): Transport {
  if (typeof BroadcastChannel === 'function') {
    const channel = new BroadcastChannel(TAB_CHANNEL)
    channel.onmessage = (e: MessageEvent<unknown>) => onRaw(e.data)
    return { post: (message) => channel.postMessage({ from: getTabId(), msg: message }), close: () => channel.close() }
  }
  // Fallback: a storage event is delivered to every other same-origin tab, never to the writer.
  let counter = 0
  const listener = (e: StorageEvent): void => {
    if (e.key !== FALLBACK_KEY || !e.newValue) return
    try {
      onRaw(JSON.parse(e.newValue))
    } catch {
      // Not ours, or truncated. Nothing to do.
    }
  }
  window.addEventListener('storage', listener)
  return {
    post(message) {
      counter += 1
      // The counter makes every write a change, otherwise identical consecutive messages would not raise an event.
      safeLocal.set(FALLBACK_KEY, JSON.stringify({ from: getTabId(), msg: message, n: counter }))
    },
    close: () => window.removeEventListener('storage', listener),
  }
}

/** Best effort: callers sit inside mutation callbacks, where a throw would turn a successful write into a failed one. */
function post(message: TabMessage): void {
  try {
    transport?.post(message)
  } catch (err) {
    errorCenter.report(err, { source: `tab-sync:${message.type}`, silent: true })
  }
}

/** Ask every other tab to invalidate queries under `key`. No-op when the lab setting `tabSync` is off. */
export function broadcastInvalidate(key: readonly unknown[]): void {
  if (getLabSettings().tabSync) post({ type: 'invalidate', key: [...key] })
}

/** Sign-in or sign-out happened here: other tabs should refetch the session. */
export function broadcastSessionChanged(): void {
  post({ type: 'session-changed' })
}

/** Tells every other tab we exist, and records ourselves in the list. */
function announceSelf(): void {
  const presence = currentPresence()
  applyPresence(presence, true)
  post({ type: 'presence', tab: presence })
}

export function handleTabMessage(raw: unknown): void {
  const parsed = Wire.safeParse(raw)
  if (!parsed.success) return
  const { msg } = parsed.data
  // A channel never delivers a message to its own sender, so a presence carrying OUR id came from another document.
  // That happens when a tab is duplicated (sessionStorage is copied). Both would drop each other's messages as
  // "own", so one of them, whoever hears the other first, takes a new id.
  if (msg.type === 'presence' && msg.tab.tabId === getTabId()) {
    rotateTabId()
    announceSelf()
    return
  }
  if (parsed.data.from === getTabId()) return
  switch (msg.type) {
    case 'presence':
      // A tab we have never heard of is new: answer immediately so it learns about us without waiting 5 s.
      if (applyPresence(msg.tab, false)) announceSelf()
      break
    case 'invalidate':
      if (getLabSettings().tabSync) void queryClient.invalidateQueries({ queryKey: msg.key })
      break
    case 'session-changed':
      void queryClient.invalidateQueries({ queryKey: ['session'] })
      break
    case 'settings-changed':
      applyingRemote = true
      try {
        if (msg.scope === 'app') useAppSettings.getState().rehydrate()
        else useLabSettings.getState().rehydrate()
      } finally {
        applyingRemote = false
      }
      break
  }
}

/**
 * Opens the cross-tab channel: presence heartbeats, query invalidation fan-out, session and settings sync.
 * Idempotent; returns a disposer.
 */
export const startTabSync = refCounted((): (() => void) => {
  try {
    transport = openTransport(handleTabMessage)
  } catch (err) {
    // Some sandboxed frames cannot open a channel. The tab still works alone: presence lists only itself.
    transport = null
    errorCenter.report(err, { source: 'tab-sync:open', silent: true })
  }

  announceSelf()

  const heartbeat = setInterval(announceSelf, PRESENCE_EVERY_MS)
  const pruner = setInterval(() => pruneTabs(), PRUNE_EVERY_MS)
  document.addEventListener('visibilitychange', announceSelf)

  const relay = (scope: 'app' | 'lab') => (): void => {
    if (!applyingRemote) post({ type: 'settings-changed', scope })
  }
  const unsubscribeApp = useAppSettings.subscribe(relay('app'))
  const unsubscribeLab = useLabSettings.subscribe(relay('lab'))

  return () => {
    clearInterval(heartbeat)
    clearInterval(pruner)
    document.removeEventListener('visibilitychange', announceSelf)
    unsubscribeApp()
    unsubscribeLab()
    transport?.close()
    transport = null
    resetOpenTabs()
  }
})
