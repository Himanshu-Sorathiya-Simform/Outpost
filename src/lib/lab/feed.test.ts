// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestLogEntry } from '@shared/contracts'
import { SERVER_LOG_RING_SIZE, WIRE_EVENT_RING_SIZE, acquireLabFeed, backoffMs, clearLabLog, mergeServerLog, useLabFeedStore } from './feed'

const entry = (seq: number, over: Partial<RequestLogEntry> = {}): RequestLogEntry => ({
  seq,
  ts: '2026-01-01T00:00:00.000Z',
  method: 'GET',
  path: `/api/x/${seq}`,
  status: 200,
  durationMs: 3,
  bytes: 10,
  requestId: `r${seq}`,
  dest: null,
  mode: null,
  site: null,
  tab: null,
  chaos: null,
  notes: [],
  reqHeaders: {},
  ...over,
})

describe('mergeServerLog', () => {
  it('dedupes by seq, newest (highest seq) first, later copy wins', () => {
    const merged = mergeServerLog([entry(1), entry(2)], [entry(2, { status: 500 }), entry(3)])
    expect(merged.map((e) => e.seq)).toEqual([3, 2, 1])
    expect(merged.find((e) => e.seq === 2)?.status).toBe(500)
  })

  it('orders out-of-order arrivals and respects the ring size', () => {
    const merged = mergeServerLog([], [entry(5), entry(1), entry(9), entry(3)], 3)
    expect(merged.map((e) => e.seq)).toEqual([9, 5, 3])
    expect(SERVER_LOG_RING_SIZE).toBe(500)
  })
})

describe('backoffMs', () => {
  it('doubles, jitters within +-25% and caps at 30 s', () => {
    expect(backoffMs(0, () => 0.5)).toBe(1000)
    expect(backoffMs(3, () => 0.5)).toBe(8000)
    expect(backoffMs(0, () => 0)).toBe(750)
    expect(backoffMs(0, () => 1)).toBe(1250)
    expect(backoffMs(20, () => 1)).toBe(37_500)
    expect(backoffMs(20, () => 0.5)).toBe(30_000)
  })
})

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  private listeners = new Map<string, Array<(e: MessageEvent<string>) => void>>()
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }
  addEventListener(name: string, fn: (e: MessageEvent<string>) => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn])
  }
  close(): void {
    this.closed = true
  }
  open(): void {
    this.onopen?.()
  }
  /** Sends an unnamed SSE message, the way a server writing `data: {...}` does. */
  send(event: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }))
  }
  /** Sends a named SSE event (`event: log`). */
  sendNamed(name: string, event: unknown): void {
    for (const fn of this.listeners.get(name) ?? []) fn(new MessageEvent(name, { data: JSON.stringify(event) }))
  }
  fail(): void {
    this.onerror?.()
  }
}

const labState = {
  serverInstance: 'inst-1',
  startedAt: '2026-01-01T00:00:00.000Z',
  chaos: { serverOffline: false, schemaDrift: false, rules: [] },
  wire: { auto: false, everySec: 20, pushOnNew: false },
  release: { latestClient: '1.0.0', minClient: '1.0.0', api: 1, handbookEdition: '1988.4' },
  headerProfile: 'realistic',
  sessionTtlSec: 600,
  counters: { requests: 0, chaosInjected: 0, dispatches: 0, pushSent: 0, subscriptions: 0, sessions: 0 },
}

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>()
const jsonRes = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }))
const latest = () => FakeEventSource.instances[FakeEventSource.instances.length - 1] as FakeEventSource

beforeEach(() => {
  vi.useFakeTimers()
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  fetchMock.mockReset()
  fetchMock.mockImplementation((url) => (url.startsWith('/api/_lab/log') ? jsonRes({ entries: [entry(1), entry(2)], lastSeq: 2 }) : jsonRes(labState)))
  vi.stubGlobal('fetch', fetchMock)
  useLabFeedStore.setState({ status: 'closed', serverLog: [], labState: null, wireEvents: [], serverInstance: null, reconnectAttempts: 0 })
})
afterEach(async () => {
  await vi.runOnlyPendingTimersAsync()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const state = () => useLabFeedStore.getState()

describe('lab feed connection', () => {
  it('connects while held, preloads the log and state, and dedupes live entries against the preload', async () => {
    const release = acquireLabFeed()
    expect(latest().url).toBe('/api/_lab/events')
    expect(state().status).toBe('connecting')
    latest().open()
    expect(state().status).toBe('open')
    await vi.advanceTimersByTimeAsync(0)
    expect(state().serverLog.map((e) => e.seq)).toEqual([2, 1])
    expect(state().labState?.serverInstance).toBe('inst-1')

    latest().send({ type: 'log', entry: entry(2) })
    latest().send({ type: 'log', entry: entry(3) })
    latest().sendNamed('log', { type: 'log', entry: entry(3) })
    expect(state().serverLog.map((e) => e.seq)).toEqual([3, 2, 1])
    release()
  })

  it('ignores garbage, collects wire and push events, updates state events', () => {
    const release = acquireLabFeed()
    latest().open()
    latest().onmessage?.(new MessageEvent('message', { data: '{not json' }))
    latest().send({ type: 'nope' })
    latest().send({ type: 'wire', dispatchId: 'dp-1', severity: 'notice', title: 'Barometer drop' })
    latest().send({ type: 'push', attempted: 2, delivered: 1, title: 'x' })
    latest().send({ type: 'state', state: { ...labState, sessionTtlSec: 5 } })
    expect(state().wireEvents.map((w) => w.event.type)).toEqual(['push', 'wire'])
    expect(state().labState?.sessionTtlSec).toBe(5)
    for (let i = 0; i < WIRE_EVENT_RING_SIZE + 5; i += 1) latest().send({ type: 'wire', dispatchId: `d${i}`, severity: 'routine', title: 't' })
    expect(state().wireEvents).toHaveLength(WIRE_EVENT_RING_SIZE)
    release()
  })

  it('clears the log when the server restarts (new instance), keeps it on a same-instance hello', async () => {
    const release = acquireLabFeed()
    latest().open()
    latest().send({ type: 'hello', serverInstance: 'inst-1' })
    await vi.advanceTimersByTimeAsync(0)
    expect(state().serverLog).toHaveLength(2)
    latest().send({ type: 'hello', serverInstance: 'inst-1' })
    expect(state().serverLog).toHaveLength(2)

    fetchMock.mockImplementation((url) => (url.startsWith('/api/_lab/log') ? jsonRes({ entries: [entry(1, { path: '/fresh' })], lastSeq: 1 }) : jsonRes(labState)))
    latest().send({ type: 'hello', serverInstance: 'inst-2' })
    expect(state().serverLog).toEqual([])
    await vi.advanceTimersByTimeAsync(0)
    expect(state().serverLog.map((e) => e.path)).toEqual(['/fresh'])
    expect(state().serverInstance).toBe('inst-2')
    release()
  })

  it('reconnects with backoff after errors, reports reconnecting, and never touches the error centre', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const release = acquireLabFeed()
    const first = latest()
    first.fail()
    expect(first.closed).toBe(true)
    expect(state()).toMatchObject({ status: 'reconnecting', reconnectAttempts: 1 })
    expect(FakeEventSource.instances).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(999)
    expect(FakeEventSource.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(state().status).toBe('reconnecting')

    latest().fail()
    expect(state().reconnectAttempts).toBe(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(FakeEventSource.instances).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeEventSource.instances).toHaveLength(3)

    latest().open()
    expect(state()).toMatchObject({ status: 'open', reconnectAttempts: 0 })
    const { useErrorCenter } = await import('@/lib/errors/center')
    expect(useErrorCenter.getState().records).toHaveLength(0)
    release()
  })

  it('reconnects immediately when the browser comes back online', () => {
    const release = acquireLabFeed()
    latest().fail()
    expect(FakeEventSource.instances).toHaveLength(1)
    window.dispatchEvent(new Event('online'))
    expect(FakeEventSource.instances).toHaveLength(2)
    release()
  })

  it('catches up from the last known seq after a reconnect', async () => {
    const release = acquireLabFeed()
    latest().open()
    await vi.advanceTimersByTimeAsync(0)
    latest().fail()
    await vi.advanceTimersByTimeAsync(2000)
    fetchMock.mockClear()
    latest().open()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/_lab/log?since=2')).toBe(true)
    release()
  })

  it('is reference counted, and survives a StrictMode style release-then-acquire', async () => {
    const a = acquireLabFeed()
    const b = acquireLabFeed()
    expect(FakeEventSource.instances).toHaveLength(1)
    a()
    a() // a second call of the same release is harmless
    await vi.advanceTimersByTimeAsync(1000)
    expect(latest().closed).toBe(false)
    b()
    const c = acquireLabFeed()
    await vi.advanceTimersByTimeAsync(1000)
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(latest().closed).toBe(false)
    c()
    await vi.advanceTimersByTimeAsync(400)
    expect(latest().closed).toBe(true)
    expect(state().status).toBe('closed')
  })

  it('clearLabLog empties only the local log', async () => {
    const release = acquireLabFeed()
    latest().open()
    await vi.advanceTimersByTimeAsync(0)
    clearLabLog()
    expect(state().serverLog).toEqual([])
    expect(state().labState).not.toBeNull()
    release()
  })

  it('stays closed when EventSource does not exist', () => {
    vi.stubGlobal('EventSource', undefined)
    const release = acquireLabFeed()
    expect(state().status).toBe('closed')
    release()
  })
})
