import { useEffect } from 'react'
import { create } from 'zustand'
import { API, LabEvent, LabState, RequestLogPage, type RequestLogEntry } from '@shared/contracts'
import { apiFetch } from '@/lib/api/client'

export const SERVER_LOG_RING_SIZE = 500
export const WIRE_EVENT_RING_SIZE = 100
/** React StrictMode unmounts and remounts immediately; waiting briefly keeps the connection through that. */
const CLOSE_GRACE_MS = 300
const BACKOFF_CAP_MS = 30_000

export type FeedStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface WireFeedEvent {
  /** Client clock when it arrived. */
  at: number
  event: Extract<LabEvent, { type: 'wire' | 'push' }>
}

export interface LabFeedState {
  status: FeedStatus
  /** The server's own request log, newest first (highest seq first), deduplicated by seq, at most 500. */
  serverLog: RequestLogEntry[]
  labState: LabState | null
  /** Dispatches the wire generator filed and pushes the server sent, newest first, at most 100. */
  wireEvents: WireFeedEvent[]
  /** Changes whenever the server restarts; its `seq` counter starts over then, so the log is cleared. */
  serverInstance: string | null
  /** Failed connection attempts since the last successful open. */
  reconnectAttempts: number
}

const initial: LabFeedState = { status: 'closed', serverLog: [], labState: null, wireEvents: [], serverInstance: null, reconnectAttempts: 0 }

export const useLabFeedStore = create<LabFeedState>(() => initial)

/** Merges log entries into the ring: one entry per seq, highest seq first. Live SSE and the preload overlap, hence the dedupe. */
export function mergeServerLog(existing: readonly RequestLogEntry[], incoming: readonly RequestLogEntry[], max: number = SERVER_LOG_RING_SIZE): RequestLogEntry[] {
  const bySeq = new Map<number, RequestLogEntry>()
  for (const entry of existing) bySeq.set(entry.seq, entry)
  for (const entry of incoming) bySeq.set(entry.seq, entry)
  return [...bySeq.values()].sort((a, b) => b.seq - a.seq).slice(0, max)
}

/** Exponential backoff with +-25% jitter, capped at 30 s. `attempt` is 0 for the first retry. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  return Math.round(Math.min(BACKOFF_CAP_MS, 1000 * 2 ** attempt) * (0.75 + random() * 0.5))
}

/** Drops the local copy of the server log (the "clear" button; the server's own ring is cleared by DELETE /api/_lab/log). */
export function clearLabLog(): void {
  useLabFeedStore.setState({ serverLog: [] })
}

// ─── connection ──────────────────────────────────────────────────────────────

const EVENT_NAMES = ['hello', 'log', 'state', 'wire', 'push'] as const

let refs = 0
let running = false
let source: EventSource | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

const set = useLabFeedStore.setState
const lastSeq = (): number => useLabFeedStore.getState().serverLog[0]?.seq ?? 0

/** Catches up on entries missed while disconnected and fetches the current lab state. Failures are silent: this is instrumentation. */
async function preload(): Promise<void> {
  const [log, state] = await Promise.allSettled([
    apiFetch({ path: API.lab.log, query: { since: lastSeq() }, schema: RequestLogPage, cache: 'no-store', netLog: false }),
    apiFetch({ path: API.lab.state, schema: LabState, cache: 'no-store', netLog: false }),
  ])
  set((s) => ({
    serverLog: log.status === 'fulfilled' ? mergeServerLog(s.serverLog, log.value.data.entries) : s.serverLog,
    labState: state.status === 'fulfilled' ? state.value.data : s.labState,
  }))
}

function handleEvent(raw: unknown): void {
  if (typeof raw !== 'string') return
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return
  }
  const parsed = LabEvent.safeParse(json)
  if (!parsed.success) return
  const event = parsed.data
  switch (event.type) {
    case 'hello': {
      const known = useLabFeedStore.getState().serverInstance
      if (known !== event.serverInstance) {
        // A different server process: its request-log seq restarted, so old entries would shadow new ones.
        set({ serverInstance: event.serverInstance, ...(known === null ? {} : { serverLog: [], wireEvents: [] }) })
        if (known !== null) void preload()
      }
      break
    }
    case 'log':
      set((s) => ({ serverLog: mergeServerLog(s.serverLog, [event.entry]) }))
      break
    case 'state':
      set({ labState: event.state })
      break
    case 'wire':
    case 'push':
      set((s) => ({ wireEvents: [{ at: Date.now(), event }, ...s.wireEvents].slice(0, WIRE_EVENT_RING_SIZE) }))
      break
  }
}

function connect(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  const { reconnectAttempts } = useLabFeedStore.getState()
  set({ status: reconnectAttempts === 0 ? 'connecting' : 'reconnecting' })

  const es = new EventSource(API.lab.events)
  source = es
  const onEvent = (e: MessageEvent<unknown>): void => handleEvent(e.data)
  es.onopen = () => {
    set({ status: 'open', reconnectAttempts: 0 })
    void preload()
  }
  es.onmessage = onEvent
  for (const name of EVENT_NAMES) es.addEventListener(name, onEvent as EventListener)
  es.onerror = () => {
    // EventSource would retry by itself, but at a fixed ~3 s and not at all after a non-200. Take over.
    es.close()
    if (source !== es) return
    source = null
    const attempt = useLabFeedStore.getState().reconnectAttempts
    set({ status: 'reconnecting', reconnectAttempts: attempt + 1 })
    retryTimer = setTimeout(connect, backoffMs(attempt))
  }
}

const reconnectNow = (): void => {
  if (running && source === null) connect()
}

function start(): void {
  if (typeof EventSource === 'undefined') return
  running = true
  window.addEventListener('online', reconnectNow)
  connect()
}

function stop(): void {
  running = false
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  source?.close()
  source = null
  window.removeEventListener('online', reconnectNow)
  set({ status: 'closed', reconnectAttempts: 0 })
}

/** Reference-counted connection: the stream is open while at least one holder exists. Returns a release function. */
export function acquireLabFeed(): () => void {
  if (closeTimer) clearTimeout(closeTimer)
  closeTimer = null
  refs += 1
  if (!running) start()
  let released = false
  return () => {
    if (released) return
    released = true
    refs -= 1
    if (refs === 0) closeTimer = setTimeout(stop, CLOSE_GRACE_MS)
  }
}

/** Mount this in any lab page that shows live server data. The stream stays open while any such page is mounted. */
export function useLabFeed(): LabFeedState {
  useEffect(() => acquireLabFeed(), [])
  return useLabFeedStore()
}
