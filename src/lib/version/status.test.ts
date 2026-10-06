// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionInfo } from '@shared/contracts'
import { AppError } from '@/lib/errors/app-error'
import { useLabSettings } from '@/lib/settings/lab-settings'
import { checkVersionNow, deriveVersionStatus, markChunkLoadFailed, startVersionWatcher, useVersionStatus, type BuildInfo } from './status'

const running: BuildInfo = { version: '1.0.0', buildId: 'b-run', builtAt: '2026-01-01T00:00:00.000Z' }
const server = (over: Partial<VersionInfo> = {}): VersionInfo => ({ server: '1.0.0', api: 1, latestClient: '1.0.0', minClient: '1.0.0', serverInstance: 'i1', startedAt: '2026-01-01T00:00:00.000Z', now: '2026-01-01T00:00:01.000Z', ...over })
const derive = (over: Partial<Parameters<typeof deriveVersionStatus>[0]> = {}) => deriveVersionStatus({ running, server: null, deployed: null, seenApiVersion: null, ...over })

describe('deriveVersionStatus', () => {
  it('is quiet with nothing known, or when everything matches', () => {
    expect(derive()).toEqual({ apiMismatch: null, skew: 'none', newDeploy: false })
    expect(derive({ server: server(), deployed: running, seenApiVersion: 1 })).toEqual({ apiMismatch: null, skew: 'none', newDeploy: false })
  })

  it('update-available when behind latestClient', () => {
    expect(derive({ server: server({ latestClient: '1.1.0' }) }).skew).toBe('update-available')
  })

  it('update-required when behind minClient, outranking update-available and api-mismatch', () => {
    expect(derive({ server: server({ latestClient: '2.0.0', minClient: '1.5.0' }), seenApiVersion: 2 }).skew).toBe('update-required')
  })

  it('api-mismatch when the server speaks another API version', () => {
    expect(derive({ seenApiVersion: 2 })).toMatchObject({ apiMismatch: 2, skew: 'api-mismatch' })
    expect(derive({ server: server({ latestClient: '1.1.0' }), seenApiVersion: 2 }).skew).toBe('api-mismatch')
  })

  it('newDeploy follows the deployed buildId, independent of skew', () => {
    expect(derive({ deployed: { ...running, buildId: 'b-next' } })).toMatchObject({ newDeploy: true, skew: 'none' })
    expect(derive({ deployed: running }).newDeploy).toBe(false)
  })

  it('does not call an unparsable version older', () => {
    expect(derive({ server: server({ latestClient: 'nightly', minClient: 'nightly' }) }).skew).toBe('none')
  })
})

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>()
const json = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', ...headers } })

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  useLabSettings.getState().reset()
  useVersionStatus.setState({ server: null, deployed: null, seenApiVersion: null, chunkLoadFailed: false, lastCheckedAt: null, lastCheckError: null, apiMismatch: null, skew: 'none', newDeploy: false })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** The running build is whatever vite injected for tests, so derive expectations from it. */
const current = () => useVersionStatus.getState().running

describe('checkVersionNow', () => {
  const route = (versionBody: unknown, buildBody: unknown) =>
    fetchMock.mockImplementation((url) => Promise.resolve(url.startsWith('/api/version') ? json(versionBody, { 'X-Api-Version': '1' }) : json(buildBody)))

  it('stores both answers and derives skew and newDeploy', async () => {
    route(server({ latestClient: '999.0.0', minClient: '0.0.1' }), { ...current(), buildId: 'someone-else' })
    await checkVersionNow()
    const s = useVersionStatus.getState()
    expect(s.server?.latestClient).toBe('999.0.0')
    expect(s.skew).toBe('update-available')
    expect(s.newDeploy).toBe(true)
    expect(s.lastCheckedAt).not.toBeNull()
    expect(s.lastCheckError).toBeNull()
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(init?.cache).toBe('no-store')
  })

  it('records a failed half but keeps what it knew before, without touching the error centre', async () => {
    route(server({ latestClient: '999.0.0' }), current())
    await checkVersionNow()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await checkVersionNow()
    const s = useVersionStatus.getState()
    expect(s.server?.latestClient).toBe('999.0.0')
    expect(s.lastCheckError).toMatch(/^(network|offline)$/)
  })

  it('shares one in-flight check between callers', async () => {
    route(server(), current())
    await Promise.all([checkVersionNow(), checkVersionNow()])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('picks up an API version mismatch from the VersionInfo body', async () => {
    route(server({ api: 2 }), current())
    await checkVersionNow()
    expect(useVersionStatus.getState()).toMatchObject({ apiMismatch: 2, skew: 'api-mismatch' })
  })
})

describe('markChunkLoadFailed', () => {
  it('sets the flag', () => {
    markChunkLoadFailed()
    expect(useVersionStatus.getState().chunkLoadFailed).toBe(true)
  })
})

describe('startVersionWatcher', () => {
  it('checks at start, then on the interval from the lab setting, and follows setting changes', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(() => Promise.reject(new AppError({ kind: 'network', message: 'down' })))
    useLabSettings.getState().set({ deployWatchSec: 10 })
    const stop = startVersionWatcher()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(4)

    useLabSettings.getState().set({ deployWatchSec: 0 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    stop()
  })

  it('checks again when the window regains focus, debounced', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(() => Promise.reject(new Error('down')))
    useLabSettings.getState().set({ deployWatchSec: 0 })
    const stop = startVersionWatcher()
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2) // the focus came inside the 2 s gap
    await vi.advanceTimersByTimeAsync(3000)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    stop()
  })

  it('learns the API version from any apiFetch response while running', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ version: 'x', buildId: 'y', builtAt: 'z' }, { 'X-Api-Version': '5' })))
    useLabSettings.getState().set({ deployWatchSec: 0 })
    const stop = startVersionWatcher()
    await vi.waitFor(() => expect(useVersionStatus.getState().apiMismatch).toBe(5))
    stop()
  })
})
