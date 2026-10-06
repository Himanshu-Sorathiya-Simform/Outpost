// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLabSettings } from '@/lib/settings/lab-settings'
import { noteApiFailure, noteApiReachable, nextProbeDelayMs, probeNow, startNetMonitor, useNetStatus } from './status'

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>()
// Our server stamps X-Served-By on every response, chaos-injected ones included.
const answer = (status = 204, headers: Record<string, string> = {}) => Promise.resolve(new Response(null, { status, headers: { 'X-Served-By': 'outpost/test', ...headers } }))

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  useLabSettings.getState().reset()
  useNetStatus.setState({ browserOnline: true, server: 'unknown', lieFi: false, lastProbeAt: null, lastLatencyMs: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const status = () => useNetStatus.getState()

describe('probeNow', () => {
  it('HEAD /api/ping with no-store and the tab id; 204 means reachable', async () => {
    fetchMock.mockImplementation(() => answer())
    await probeNow()
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/ping')
    expect(init).toMatchObject({ method: 'HEAD', cache: 'no-store' })
    expect((init?.headers as Record<string, string>)['X-Tab-Id']).toMatch(/^tab-/)
    expect(status()).toMatchObject({ server: 'reachable', lieFi: false })
    expect(status().lastProbeAt).not.toBeNull()
    expect(status().lastLatencyMs).not.toBeNull()
  })

  it('a rejected fetch is unreachable, and lie-fi when the browser claims to be online', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await probeNow()
    expect(status()).toMatchObject({ server: 'unreachable', lieFi: true, browserOnline: true })
  })

  it('unreachable while the browser is offline is not lie-fi', async () => {
    useNetStatus.setState({ browserOnline: false })
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await probeNow()
    expect(status()).toMatchObject({ server: 'unreachable', lieFi: false })
  })

  it('a 5xx still means the server answered', async () => {
    fetchMock.mockImplementation(() => answer(503))
    await probeNow()
    expect(status().server).toBe('reachable')
  })

  it('a captive-portal 200 HTML page and a service-worker-made answer do not count', async () => {
    fetchMock.mockImplementationOnce(() => answer(200, { 'Content-Type': 'text/html' }))
    await probeNow()
    expect(status().server).toBe('unreachable')
    fetchMock.mockImplementationOnce(() => answer(204, { 'X-SW-Source': 'fallback' }))
    await probeNow()
    expect(status().server).toBe('unreachable')
    fetchMock.mockImplementationOnce(() => answer(204, { 'X-SW-Source': 'network' }))
    await probeNow()
    expect(status().server).toBe('reachable')
  })

  it('a response nobody at the server stamped is not the server: a worker that answers 503 for itself does not make it reachable', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response('Offline', { status: 503 })))
    await probeNow()
    expect(status().server).toBe('unreachable')
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 })))
    await probeNow()
    expect(status().server).toBe('unreachable')
    fetchMock.mockImplementationOnce(() => answer(503))
    await probeNow()
    expect(status().server).toBe('reachable')
  })

  it('gives up after 3 s of silence', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_url, init) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))))
    const probe = probeNow()
    await vi.advanceTimersByTimeAsync(3000)
    await probe
    expect(status().server).toBe('unreachable')
  })

  it('shares one in-flight probe', async () => {
    fetchMock.mockImplementation(() => answer())
    await Promise.all([probeNow(), probeNow(), probeNow()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('noteApiReachable', () => {
  it('flips unreachable to reachable without pretending a probe ran', () => {
    useNetStatus.setState({ server: 'unreachable', lieFi: true })
    noteApiReachable()
    expect(status()).toMatchObject({ server: 'reachable', lieFi: false, lastProbeAt: null })
  })
})

describe('nextProbeDelayMs', () => {
  it('uses the interval while healthy and backs off (shorter) while down, with jitter', () => {
    expect(nextProbeDelayMs(15, 0, () => 0.5)).toBe(15_000)
    expect(nextProbeDelayMs(15, 1, () => 0.5)).toBe(2000)
    expect(nextProbeDelayMs(15, 2, () => 0.5)).toBe(4000)
    expect(nextProbeDelayMs(15, 10, () => 0.5)).toBe(15_000)
    expect(nextProbeDelayMs(10, 0, () => 0)).toBe(8000)
    expect(nextProbeDelayMs(10, 0, () => 1)).toBe(12_000)
  })
})

describe('startNetMonitor', () => {
  it('probes on start, on focus, on the interval and on offline/online, and stops cleanly', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(() => answer())
    useLabSettings.getState().set({ probeIntervalSec: 10 })
    const stop = startNetMonitor()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event('offline'))
    expect(status().browserOnline).toBe(false)
    window.dispatchEvent(new Event('online'))
    expect(status().browserOnline).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(3) // offline and online share one in-flight probe

    const beforeInterval = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(12_000)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(beforeInterval)

    stop()
    const settled = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(settled)
  })

  it('leaves no timer behind when it is stopped while a probe is still in flight', async () => {
    vi.useFakeTimers()
    let answerProbe: (res: Response) => void = () => undefined
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (answerProbe = resolve)))
    useLabSettings.getState().set({ probeIntervalSec: 10 })
    const stop = startNetMonitor()
    await vi.advanceTimersByTimeAsync(0)
    stop()
    answerProbe(new Response(null, { status: 204 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('tracks the browser online flag from events', async () => {
    fetchMock.mockImplementation(() => answer())
    useLabSettings.getState().set({ probeIntervalSec: 0 })
    const stop = startNetMonitor()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    expect(status().browserOnline).toBe(false)
    window.dispatchEvent(new Event('online'))
    expect(status().browserOnline).toBe(true)
    stop()
  })

  it('an interval of 0 disables the timer but events still probe', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(() => answer())
    useLabSettings.getState().set({ probeIntervalSec: 0 })
    const stop = startNetMonitor()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    stop()
  })

  it('backs off while the server is down and recovers without touching the error centre', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    let up = false
    fetchMock.mockImplementation(() => (up ? answer() : Promise.reject(new TypeError('Failed to fetch'))))
    useLabSettings.getState().set({ probeIntervalSec: 30 })
    const stop = startNetMonitor()
    await vi.advanceTimersByTimeAsync(0) // probe 1 fails, next in 2 s
    expect(status().server).toBe('unreachable')
    await vi.advanceTimersByTimeAsync(2000) // probe 2 fails, next in 4 s
    expect(fetchMock).toHaveBeenCalledTimes(2)
    up = true
    await vi.advanceTimersByTimeAsync(4000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(status().server).toBe('reachable')
    stop()
  })

  it('probes after a transport-level API failure, but not after other kinds, and only while running', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(() => answer())
    useLabSettings.getState().set({ probeIntervalSec: 0 })
    noteApiFailure('network')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).not.toHaveBeenCalled()

    const stop = startNetMonitor()
    await vi.advanceTimersByTimeAsync(0)
    const afterStart = fetchMock.mock.calls.length
    noteApiFailure('not-found')
    noteApiFailure('server')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(afterStart)

    await vi.advanceTimersByTimeAsync(1500)
    noteApiFailure('timeout')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(afterStart + 1)
    stop()
  })
})
