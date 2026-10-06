// @vitest-environment jsdom
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BenchResponse, ChaosState, LabState, PushSubscriptionList, SignalBoard } from '@shared/contracts'
import { shouldDehydrateQuery } from '@/lib/query/persister'
import { useLabSettings } from '@/lib/settings/lab-settings'
import { useBench, useBumpBench, benchQueryOptions } from './bench'
import { useDispatch, useDispatchFeed } from './dispatches'
import { errorResponse, jsonResponse } from './fake-server'
import { handbookChapterQueryOptions, handbookIndexQueryOptions, useHandbookChapter, useHandbookIndex } from './handbook'
import { inboxQueryOptions, useDigest, useInbox } from './inbox'
import { useApplyChaosPreset, useLabState, useLabTruth, useResetLab, useSetHeaderProfile, useSpawnWire } from './lab'
import { qk } from './keys'
import { usePushSubscriptions, usePushVapid, useSendPush } from './push'
import { sessionQueryOptions, useSession } from './session'
import { signalQueryOptions, useSignal } from './signal'
import { stationsQueryOptions, useStation, useStations } from './stations'
import { cleanupHooks, flush, renderHook, settle, testClient, waitFor } from './test-harness'

let client: QueryClient
let requests: { method: string; url: string; body: unknown }[]
let respond: (method: string, url: string) => Response

beforeEach(() => {
  client = testClient()
  requests = []
  respond = () => errorResponse(404, 'not_found', 'nothing here')
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    requests.push({ method, url: input, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
    return respond(method, input)
  })
})
afterEach(() => {
  cleanupHooks()
  client.clear()
  vi.unstubAllGlobals()
})

const countOf = (method: string, url: string) => requests.filter((r) => r.method === method && r.url === url).length

describe('every query', () => {
  it('carries meta.url (the service worker bridge invalidates by it) and lab/session carry persist: false', async () => {
    renderHook(
      () => [
        useSession(),
        useDispatchFeed(),
        useDispatch('dp-000001'),
        useInbox(),
        useDigest(),
        useStations(),
        useStation('KRN-07'),
        useSignal(),
        useHandbookIndex(),
        useHandbookChapter('loss-of-contact'),
        useBench('cache-first', 'alpha'),
        usePushVapid(),
        usePushSubscriptions(),
        useLabState(),
        useLabTruth(),
      ],
      client,
    )
    await waitFor(() => client.getQueryCache().getAll().length === 15 && !client.isFetching())

    const queries = client.getQueryCache().getAll()
    for (const q of queries) {
      expect(q.meta?.url, `${q.queryHash} has no meta.url`).toMatch(/^\/api\//)
    }
    const unpersisted = queries.filter((q) => q.queryKey[0] === 'lab' || q.queryKey[0] === 'session')
    expect(unpersisted).toHaveLength(3)
    expect(unpersisted.every((q) => q.meta?.persist === false)).toBe(true)
  })

  it('names the path of the request it makes', () => {
    const urls = [sessionQueryOptions(), inboxQueryOptions(), stationsQueryOptions(), handbookIndexQueryOptions()].map((o) => o.meta?.url)
    expect(urls).toEqual(['/api/session', '/api/inbox/summary', '/api/stations', '/api/handbook'])
  })
})

describe('persistence rules', () => {
  it('never writes lab or session queries to disk, and does write product data', () => {
    const succeeded = (queryKey: readonly unknown[]) => {
      client.setQueryData(queryKey, 'data')
      const query = client.getQueryCache().find({ queryKey, exact: true })
      if (!query) throw new Error('query was not created')
      return query
    }
    expect(shouldDehydrateQuery(succeeded(qk.lab.state()))).toBe(false)
    expect(shouldDehydrateQuery(succeeded(qk.lab.truth()))).toBe(false)
    expect(shouldDehydrateQuery(succeeded(qk.session()))).toBe(false)
    expect(shouldDehydrateQuery(succeeded(qk.feed()))).toBe(true)
    expect(shouldDehydrateQuery(succeeded(qk.stationList()))).toBe(true)
  })
})

describe('freshness', () => {
  it('uses a stale time that matches how fast each kind of data changes', () => {
    expect(inboxQueryOptions().staleTime).toBe(15_000)
    expect(stationsQueryOptions().staleTime).toBe(60_000)
    expect(handbookIndexQueryOptions().staleTime).toBe(600_000)
    expect(handbookChapterQueryOptions('x').staleTime).toBe(600_000)
    expect(sessionQueryOptions().staleTime).toBe(0)
    expect(signalQueryOptions().staleTime).toBe(0)
  })

  it('leaves dispatch freshness to the lab setting (no staleTime of its own)', async () => {
    const h = renderHook(() => useDispatch('dp-000001'), client)
    await waitFor(() => client.getQueryCache().getAll().length === 1)
    expect(client.getQueryCache().getAll()[0]?.observers[0]?.options.staleTime).toBe(30_000)
    h.unmount()
  })

  it('polls the signal board only when asked, and idles when the route param is missing', async () => {
    expect(signalQueryOptions().refetchInterval).toBe(false)
    expect(signalQueryOptions(0).refetchInterval).toBe(false)
    expect(signalQueryOptions(4000).refetchInterval).toBe(4000)

    const idle = renderHook(() => useDispatch(undefined), client)
    await flush()
    expect(requests).toHaveLength(0)
    expect(idle.result.current.fetchStatus).toBe('idle')
  })

  it('refetches the signal board on its interval, with seq moving each time', async () => {
    let seq = 0
    respond = () => jsonResponse({ seq: ++seq, sampledAt: '2026-01-01T00:00:00.000Z', readings: [] } satisfies SignalBoard)
    const h = renderHook(() => useSignal({ pollMs: 25 }), client)
    await waitFor(() => (h.result.current.data?.seq ?? 0) >= 3)
    expect(countOf('GET', '/api/signal')).toBeGreaterThanOrEqual(3)
  })
})

describe('data and meta together', () => {
  it('hands back the payload and its provenance side by side', async () => {
    respond = () => jsonResponse({ unread: 2, urgentUnread: 1, total: 9, feedRev: 4, asOf: '2026-01-01T00:00:00.000Z' }, 200, { 'X-SW-Source': 'cache' })
    const h = renderHook(() => useInbox(), client)
    await waitFor(() => h.result.current.data !== undefined)
    expect(h.result.current.data?.unread).toBe(2)
    expect(h.result.current.meta).toMatchObject({ url: '/api/inbox/summary', source: 'sw-cache', status: 200 })
  })

  it('types failures as AppError', async () => {
    respond = () => errorResponse(503, 'unavailable', 'down')
    const h = renderHook(() => useInbox(), client)
    await waitFor(() => h.result.current.error !== null)
    expect(h.result.current.error?.kind).toBe('unavailable')
    expect(h.result.current.data).toBeUndefined()
    expect(h.result.current.meta).toBeUndefined()
  })
})

const benchBody = (rev: number, hits: number): BenchResponse => ({
  strategy: 'cache-first',
  key: 'alpha',
  rev,
  hits,
  servedAt: '2026-01-01T00:00:00.000Z',
  serverInstance: 'inst',
  requestId: 'req',
  payload: { label: 'Alpha', sample: 1000 + rev },
})

describe('bench', () => {
  it('reads once, never refetches by itself, and lets a bump leave the cached reading behind', async () => {
    let rev = 1
    respond = (method) => (method === 'POST' ? jsonResponse({ rev: ++rev }) : jsonResponse(benchBody(rev, 1)))
    const h = renderHook(() => ({ bench: useBench('cache-first', 'alpha'), bump: useBumpBench() }), client)
    await waitFor(() => h.result.current.bench.data !== undefined)

    await settle(() => h.result.current.bump.mutateAsync({ strategy: 'cache-first', key: 'alpha' }))
    await flush()

    expect(h.result.current.bump.data?.data.rev).toBe(2)
    expect(h.result.current.bench.data?.rev).toBe(1)
    expect(countOf('GET', '/api/bench/cache-first/alpha')).toBe(1)

    await settle(() => h.result.current.bench.refetch())
    expect(h.result.current.bench.data?.rev).toBe(2)
  })

  it('takes a fresh reading every time the page mounts, so a reading restored from disk is never shown as current', async () => {
    let rev = 1
    respond = () => jsonResponse(benchBody(rev++, 1))
    const first = renderHook(() => useBench('cache-first', 'alpha'), client)
    await waitFor(() => first.result.current.data !== undefined)
    first.unmount()
    const second = renderHook(() => useBench('cache-first', 'alpha'), client)
    await waitFor(() => second.result.current.data?.rev === 2)
    expect(countOf('GET', '/api/bench/cache-first/alpha')).toBe(2)
  })

  it('shows a cache miss as it is: one attempt, no retry, even with retries configured', async () => {
    useLabSettings.getState().set({ retries: 3 })
    respond = () => errorResponse(504, 'unavailable', 'cache-only miss', undefined, { 'X-SW-Source': 'cache-miss' })
    const h = renderHook(() => useBench('cache-only', 'delta'), client)
    await waitFor(() => h.result.current.error !== null)
    expect(h.result.current.error?.kind).toBe('cache-miss')
    expect(countOf('GET', '/api/bench/cache-only/delta')).toBe(1)
  })

  it('attempts the request even while the browser says it is offline', () => {
    expect(benchQueryOptions('cache-first', 'alpha').networkMode).toBe('always')
  })

  it('starts idle when disabled, and refetch() still works', async () => {
    respond = () => jsonResponse(benchBody(1, 1))
    const h = renderHook(() => useBench('cache-first', 'alpha', { enabled: false }), client)
    await flush()
    expect(requests).toHaveLength(0)
    await settle(() => h.result.current.refetch())
    expect(h.result.current.data?.rev).toBe(1)
  })
})

const labStateBody = (): LabState => ({
  serverInstance: 'inst',
  startedAt: '2026-01-01T00:00:00.000Z',
  chaos: { serverOffline: false, schemaDrift: false, rules: [] },
  wire: { auto: false, everySec: 20, pushOnNew: false },
  release: { latestClient: '1.0.0', minClient: '1.0.0', api: 1, handbookEdition: '1988.4' },
  headerProfile: 'realistic',
  sessionTtlSec: 600,
  counters: { requests: 0, chaosInjected: 0, dispatches: 0, pushSent: 0, subscriptions: 0, sessions: 0 },
})

describe('lab mutations', () => {
  it('refresh the lab state after they land, and send what was asked', async () => {
    const chaos: ChaosState = { serverOffline: true, schemaDrift: false, rules: [] }
    respond = (_method, url) => {
      if (url.includes('/chaos/preset/')) return jsonResponse(chaos)
      if (url === '/api/_lab/headers') return jsonResponse({ profile: 'no-store' })
      if (url === '/api/_lab/wire/spawn') return jsonResponse({ spawned: [] }, 201)
      return jsonResponse(labStateBody())
    }
    const h = renderHook(() => ({ state: useLabState(), preset: useApplyChaosPreset(), headers: useSetHeaderProfile(), spawn: useSpawnWire() }), client)
    await waitFor(() => h.result.current.state.data !== undefined)
    const before = countOf('GET', '/api/_lab/state')

    await settle(() => h.result.current.preset.mutateAsync('hard-down'))
    await waitFor(() => countOf('GET', '/api/_lab/state') === before + 1)
    await settle(() => h.result.current.headers.mutateAsync('no-store'))
    await settle(() => h.result.current.spawn.mutateAsync({ count: 2 }))

    expect(requests.find((r) => r.url === '/api/_lab/chaos/preset/hard-down')?.method).toBe('POST')
    expect(requests.find((r) => r.url === '/api/_lab/headers')?.body).toEqual({ profile: 'no-store' })
    expect(requests.find((r) => r.url === '/api/_lab/wire/spawn')?.body).toEqual({ count: 2 })
    expect(h.result.current.preset.data?.data.serverOffline).toBe(true)
  })

  it('never retries a failed write: repeating a toggle would flip it back', async () => {
    respond = () => errorResponse(503, 'unavailable', 'down')
    useLabSettings.getState().set({ retries: 3 })
    const h = renderHook(() => useApplyChaosPreset(), client)
    await settle(() => h.result.current.mutateAsync('flaky'))
    expect(h.result.current.error?.kind).toBe('unavailable')
    expect(requests).toHaveLength(1)
  })

  it('a reset invalidates every cached query, since all of it may be wrong now', async () => {
    respond = () => jsonResponse(labStateBody())
    const h = renderHook(() => useResetLab(), client)
    const spy = vi.spyOn(client, 'invalidateQueries')
    await settle(() => h.result.current.mutateAsync())
    expect(spy).toHaveBeenCalledWith()
  })
})

describe('push', () => {
  it('refreshes the subscription list after a send, which records per-subscription results', async () => {
    const list: PushSubscriptionList = { items: [] }
    respond = (method, url) => (method === 'GET' && url === '/api/push/subscriptions' ? jsonResponse(list) : errorResponse(500, 'internal', 'not under test'))
    const h = renderHook(() => ({ subs: usePushSubscriptions(), send: useSendPush() }), client)
    await waitFor(() => h.result.current.subs.data !== undefined)
    const before = countOf('GET', '/api/push/subscriptions')
    await settle(() => h.result.current.send.mutateAsync({ kind: 'custom', title: 'Ping' }))
    await waitFor(() => countOf('GET', '/api/push/subscriptions') > before)
    expect(requests.find((r) => r.url === '/api/push/send')?.body).toEqual({ kind: 'custom', title: 'Ping' })
  })
})
