// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AppError } from '@/lib/errors/app-error'
import { useErrorCenter } from '@/lib/errors/center'
import { useLabSettings } from '@/lib/settings/lab-settings'
import { apiFetch, buildPath, combineSignals, kindForStatus, observeApiVersion, parseRetryAfter, type ApiRequest } from './client'
import { useNetLog } from './net-log'

const Ok = z.object({ ok: z.boolean() })
const JSON_HEADERS = { 'Content-Type': 'application/json' }

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } })

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  useNetLog.getState().clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

const call = (over: Partial<ApiRequest<{ ok: boolean }>> = {}) => apiFetch({ path: '/api/x', schema: Ok, ...over })

/** Resolves with the thrown AppError so tests can assert on it. */
async function failure(over: Partial<ApiRequest<{ ok: boolean }>> = {}): Promise<AppError> {
  try {
    await call(over)
  } catch (e) {
    if (AppError.is(e)) return e
    throw e
  }
  throw new Error('expected apiFetch to throw')
}

/** A fetch that never answers until its signal aborts, like a hung connection. */
const hang = (_url: string, init?: RequestInit): Promise<Response> =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
  })

describe('request building', () => {
  it('sorts query keys, skips undefined and null, and encodes values', () => {
    expect(buildPath('/api/d', { b: 2, a: 'x y', skip: undefined, nope: null, flag: false })).toBe('/api/d?a=x+y&b=2&flag=false')
    expect(buildPath('/api/d', {})).toBe('/api/d')
    expect(buildPath('/api/d?x=1', { y: 2 })).toBe('/api/d?x=1&y=2')
  })

  it('sends tab id, accept, JSON body, If-Match and Idempotency-Key', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await call({ method: 'PATCH', body: { read: true }, ifMatch: 'W/"dp-1-r3"', idempotencyKey: 'key-12345678', query: { z: 1, a: 2 } })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    const headers = init?.headers as Headers
    expect(url).toBe('/api/x?a=2&z=1')
    expect(init?.method).toBe('PATCH')
    expect(init?.credentials).toBe('same-origin')
    expect(init?.body).toBe('{"read":true}')
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('If-Match')).toBe('W/"dp-1-r3"')
    expect(headers.get('Idempotency-Key')).toBe('key-12345678')
    expect(headers.get('X-Tab-Id')).toMatch(/^tab-/)
  })

  it('does not pre-fail while navigator.onLine is false: it tries, and a service worker answer succeeds', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }, 200, { 'X-SW-Source': 'cache' }))
    const { data, meta } = await call()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(data).toEqual({ ok: true })
    expect(meta.source).toBe('sw-cache')
  })
})

describe('success', () => {
  it('returns validated data with response metadata', async () => {
    const servedAt = new Date(Date.now() - 5000).toISOString()
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true }, 200, {
        'X-Request-Id': 'r1',
        'X-Served-At': servedAt,
        'X-Served-By': 'outpost/abc',
        'X-Api-Version': '1',
        'X-Resource-Rev': '7',
        ETag: 'W/"x-r7"',
        'Cache-Control': 'no-cache',
        Age: '12',
        'X-Chaos': 'Lie-fi',
      }),
    )
    const { meta } = await call()
    expect(meta).toMatchObject({
      url: '/api/x',
      method: 'GET',
      status: 200,
      requestId: 'r1',
      servedAt,
      servedBy: 'outpost/abc',
      apiVersion: 1,
      rev: 7,
      etag: 'W/"x-r7"',
      cacheControl: 'no-cache',
      ageHeader: 12,
      chaos: 'Lie-fi',
      source: 'network',
      redirected: false,
    })
    expect(meta.dataAgeMs).toBeGreaterThanOrEqual(5000)
    expect(meta.dataAgeMs).toBeLessThan(8000)
    expect(meta.durationMs).toBeGreaterThanOrEqual(0)
    expect(meta.bytes).toBe(JSON.stringify({ ok: true }).length)
  })

  it('leaves dataAgeMs null without X-Served-At and clamps negative skew to zero', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    expect((await call()).meta.dataAgeMs).toBeNull()
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }, 200, { 'X-Served-At': new Date(Date.now() + 60_000).toISOString() }))
    expect((await call()).meta.dataAgeMs).toBe(0)
  })

  it('tolerates an empty body only with allowEmpty, handing the schema undefined', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })))
    const { data, meta } = await apiFetch({ path: '/api/ping', schema: z.undefined(), allowEmpty: true })
    expect(data).toBeUndefined()
    expect(meta.status).toBe(204)
    const error = await failure()
    expect(error.kind).toBe('parse')
    expect(error.message).toMatch(/Empty response body/)
  })

  it('is not undone by an observer that throws: the response was fine', async () => {
    const stop = observeApiVersion(() => {
      throw new Error('observer bug')
    })
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }, 200, { 'X-Api-Version': '2' }))
    try {
      await expect(call()).resolves.toMatchObject({ data: { ok: true } })
    } finally {
      stop()
    }
    expect(useErrorCenter.getState().records[0]?.source).toBe('api-version-observer')
  })

  it('handles HEAD without reading a body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const { meta } = await apiFetch({ method: 'HEAD', path: '/api/ping', schema: z.undefined(), allowEmpty: true })
    expect(meta.method).toBe('HEAD')
  })

  it('reports an API version mismatch to observers from any response', async () => {
    const seen: number[] = []
    const stop = observeApiVersion((v) => seen.push(v))
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }, 200, { 'X-Api-Version': '2' }))
    await call()
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'internal', message: 'x', requestId: 'r' } }, 500, { 'X-Api-Version': '3' }))
    await failure()
    stop()
    expect(seen).toEqual([2, 3])
  })
})

describe('provenance through apiFetch', () => {
  it('uses X-SW-Source and keeps the other SW headers', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }, 200, { 'X-SW-Source': 'revalidated', 'X-SW-Strategy': 'stale-while-revalidate', 'X-SW-Cache': 'api-v3', 'X-SW-Cached-At': '2026-01-01T00:00:00.000Z' }))
    const { meta } = await call()
    expect(meta).toMatchObject({ source: 'sw-network', sourceReason: 'header:X-SW-Source=revalidated', swStrategy: 'stale-while-revalidate', swCache: 'api-v3', swCachedAt: '2026-01-01T00:00:00.000Z' })
  })

  it('falls back to resource timing: transferSize 0 is http-cache without a controller, sw-cache with one', async () => {
    const entries: PerformanceResourceTiming[] = []
    vi.spyOn(performance, 'getEntriesByName').mockImplementation(() => entries as unknown as PerformanceEntryList)
    fetchMock.mockImplementation(() => {
      entries.length = 0
      entries.push({ name: 'http://localhost:3000/api/x', startTime: performance.now(), transferSize: 0, encodedBodySize: 11, decodedBodySize: 11, deliveryType: 'cache' } as unknown as PerformanceResourceTiming)
      return Promise.resolve(jsonResponse({ ok: true }))
    })
    const plain = await call()
    expect(plain.meta).toMatchObject({ source: 'http-cache', transferSize: 0, deliveryType: 'cache', bytes: 11 })

    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: {} } })
    expect((await call()).meta.source).toBe('sw-cache')
  })

  it('looks the entry up by the final URL, not the requested one', async () => {
    const spy = vi.spyOn(performance, 'getEntriesByName').mockReturnValue([])
    const res = jsonResponse({ ok: true })
    Object.defineProperty(res, 'url', { value: 'http://localhost:3000/api/final' })
    fetchMock.mockResolvedValue(res)
    const { meta } = await call()
    expect(spy).toHaveBeenCalledWith('http://localhost:3000/api/final', 'resource')
    expect(meta.url).toBe('/api/final')
  })
})

describe('HTTP status classification', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [409, 'conflict'],
    [412, 'conflict'],
    [400, 'validation'],
    [422, 'validation'],
    [426, 'version-skew'],
    [429, 'rate-limited'],
    [502, 'unavailable'],
    [503, 'unavailable'],
    [504, 'unavailable'],
    [500, 'server'],
    [507, 'server'],
    [418, 'http'],
    [410, 'http'],
  ])('%i is %s', async (status, kind) => {
    fetchMock.mockResolvedValue(jsonResponse({ hello: 'x' }, status))
    const error = await failure()
    expect(error.kind).toBe(kind)
    expect(error.context).toMatchObject({ status, url: '/api/x', method: 'GET' })
    expect(kindForStatus(status)).toBe(kind)
  })

  it('decodes the uniform error body into context', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'validation_failed', message: 'title too short', details: [{ path: ['title'] }], requestId: 'req-9' } }, 422))
    const error = await failure({ method: 'POST', body: {} })
    expect(error.message).toBe('title too short')
    expect(error.context).toMatchObject({ code: 'validation_failed', requestId: 'req-9', details: [{ path: ['title'] }] })
  })

  it('falls back to the X-Request-Id header and a generic message when the body is not the uniform shape', async () => {
    fetchMock.mockResolvedValue(new Response('<h1>Bad gateway</h1>', { status: 502, statusText: 'Bad Gateway', headers: { 'X-Request-Id': 'hdr-1', 'Content-Type': 'text/html' } }))
    const error = await failure()
    expect(error.kind).toBe('unavailable')
    expect(error.message).toBe('HTTP 502 Bad Gateway')
    expect(error.context.requestId).toBe('hdr-1')
  })

  it('carries the current server version in conflict details for 412', async () => {
    const current = { id: 'dp-1', rev: 4 }
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'conflict', message: 'stale', details: { current }, requestId: 'r' } }, 412))
    const error = await failure({ method: 'PATCH', ifMatch: 'W/"dp-1-r3"' })
    expect(error.kind).toBe('conflict')
    expect(error.context.details).toEqual({ current })
  })

  it('reads Retry-After seconds and dates on 429 and exposes the chaos label', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'rate_limited', message: 'slow down', requestId: 'r' } }, 429, { 'Retry-After': '17', 'X-Chaos': 'Rate limited' }))
    const error = await failure()
    expect(error.kind).toBe('rate-limited')
    expect(error.retryable).toBe(true)
    expect(error.context).toMatchObject({ retryAfterSec: 17, chaos: 'Rate limited' })
    expect(parseRetryAfter(new Date(Date.now() + 30_000).toUTCString())).toBeGreaterThanOrEqual(29)
    expect(parseRetryAfter('garbage')).toBeUndefined()
    expect(parseRetryAfter(null)).toBeUndefined()
  })

  it('reads a 504 from the service worker marked cache-miss as cache-miss, not unavailable', async () => {
    fetchMock.mockResolvedValue(new Response('no entry', { status: 504, headers: { 'X-SW-Source': 'cache-miss' } }))
    const error = await failure()
    expect(error.kind).toBe('cache-miss')
    expect(error.retryable).toBe(true)
    expect(useNetLog.getState().entries[0]).toMatchObject({ status: 504, source: 'sw-fallback', errorKind: 'cache-miss' })
  })
})

describe('parse failures on 2xx', () => {
  it('names an HTML body as a captive portal or SPA fallback', async () => {
    fetchMock.mockResolvedValue(new Response('<!doctype html><title>Sign in</title>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    const error = await failure()
    expect(error.kind).toBe('parse')
    expect(error.message).toMatch(/text\/html/)
    expect(error.message).toMatch(/captive portal or SPA fallback/)
    expect(error.context.snippet).toMatch(/^<!doctype/)
  })

  it('catches HTML served with a JSON content-type by content, not just by header', async () => {
    fetchMock.mockResolvedValue(new Response('<html></html>', { status: 200, headers: JSON_HEADERS }))
    const error = await failure()
    expect(error.kind).toBe('parse')
    expect(error.message).toMatch(/not valid JSON/)
  })

  it('reports an empty 200', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200, headers: JSON_HEADERS }))
    const error = await failure()
    expect(error.kind).toBe('parse')
    expect(error.message).toMatch(/Empty response body \(HTTP 200/)
  })

  it('reports garbled JSON with the parser reason and a snippet', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok": tru', { status: 200, headers: JSON_HEADERS }))
    const error = await failure()
    expect(error.kind).toBe('parse')
    expect(error.message).toMatch(/not valid JSON/)
    expect(error.context.snippet).toBe('{"ok": tru')
  })

  it('reports a non-JSON content-type, including a missing one', async () => {
    fetchMock.mockResolvedValueOnce(new Response('hello', { status: 200, headers: { 'Content-Type': 'text/plain' } }))
    expect((await failure()).message).toMatch(/"text\/plain"/)
    const bare = new Response('{"ok":true}', { status: 200 })
    bare.headers.delete('Content-Type')
    fetchMock.mockResolvedValueOnce(bare)
    expect((await failure()).message).toMatch(/no content-type/)
  })
})

describe('schema mismatch', () => {
  it('reports the failing paths and keeps the zod error as cause', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: 'yes' }, 200, { 'X-Request-Id': 'r5', 'X-Api-Version': '2' }))
    const error = await failure()
    expect(error.kind).toBe('schema-mismatch')
    expect(error.context.issues).toEqual([expect.stringMatching(/^ok:/)])
    expect(error.context).toMatchObject({ requestId: 'r5', apiVersion: 2 })
    expect(error.cause).toBeInstanceOf(z.ZodError)
  })
})

describe('transport failures', () => {
  it('rejected fetch is network while the browser thinks it is online', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await failure()
    expect(error.kind).toBe('network')
    expect(error.context.phase).toBe('fetch')
  })

  it('rejected fetch is offline when navigator.onLine is false', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await failure()).kind).toBe('offline')
  })

  it('a Response.error() handed back instead of a rejection is still a network failure, not "HTTP 0"', async () => {
    fetchMock.mockResolvedValue(Response.error())
    const error = await failure()
    expect(error.kind).toBe('network')
    expect(error.context).toMatchObject({ phase: 'fetch' })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect((await failure()).kind).toBe('offline')
  })

  it('a body that dies mid-stream is a network error in the body phase', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"ok":'))
        controller.error(new TypeError('terminated'))
      },
    })
    fetchMock.mockResolvedValue(new Response(stream, { status: 200, headers: JSON_HEADERS }))
    const error = await failure()
    expect(error.kind).toBe('network')
    expect(error.context).toMatchObject({ phase: 'body', status: 200 })
  })

  it('distinguishes its own timeout from a caller abort', async () => {
    fetchMock.mockImplementation(hang)
    const timeout = await failure({ timeoutMs: 15 })
    expect(timeout.kind).toBe('timeout')
    expect(timeout.context.timeoutMs).toBe(15)

    const controller = new AbortController()
    const pending = failure({ signal: controller.signal, timeoutMs: 5000 })
    setTimeout(() => controller.abort(), 10)
    expect((await pending).kind).toBe('aborted')
  })

  it('reads a caller signal that is an AbortSignal.timeout() as a timeout, not a cancellation', async () => {
    fetchMock.mockImplementation(hang)
    expect((await failure({ signal: AbortSignal.timeout(15), timeoutMs: 0 })).kind).toBe('timeout')

    const expired = AbortSignal.abort(new DOMException('gave up', 'TimeoutError'))
    expect((await failure({ signal: expired })).kind).toBe('timeout')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports abort when the signal was already aborted, without calling fetch', async () => {
    const controller = new AbortController()
    controller.abort()
    expect((await failure({ signal: controller.signal })).kind).toBe('aborted')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('takes the default timeout from the lab setting, and 0 disables it', async () => {
    useLabSettings.getState().set({ requestTimeoutMs: 15 })
    try {
      fetchMock.mockImplementation(hang)
      expect((await failure()).kind).toBe('timeout')
      fetchMock.mockImplementation(() => new Promise<Response>((resolve) => setTimeout(() => resolve(jsonResponse({ ok: true })), 40)))
      await expect(call({ timeoutMs: 0 })).resolves.toBeDefined()
    } finally {
      useLabSettings.getState().reset()
    }
  })
})

describe('combineSignals', () => {
  it('relays aborts through the manual fallback when AbortSignal.any is missing', () => {
    const original = AbortSignal.any
    // @ts-expect-error simulating an older browser
    AbortSignal.any = undefined
    try {
      const a = new AbortController()
      const b = new AbortController()
      const { signal, dispose } = combineSignals([a.signal, b.signal])
      expect(signal.aborted).toBe(false)
      b.abort(new Error('second'))
      expect(signal.aborted).toBe(true)
      expect((signal.reason as Error).message).toBe('second')
      dispose()
    } finally {
      AbortSignal.any = original
    }
  })

  it('is already aborted if one input is', () => {
    const a = new AbortController()
    a.abort()
    expect(combineSignals([a.signal, new AbortController().signal]).signal.aborted).toBe(true)
  })
})

describe('network log', () => {
  it('records successes and failures, newest first, and can be skipped', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }, 200, { 'X-Request-Id': 'r1' }))
    await call()
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'not_found', message: 'nope', requestId: 'r2' } }, 404, { 'X-Chaos': 'Stale chunks' }))
    await failure()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await failure()
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await call({ netLog: false })

    const [dropped, missing, fine] = useNetLog.getState().entries
    expect(useNetLog.getState().entries).toHaveLength(3)
    expect(fine).toMatchObject({ method: 'GET', url: '/api/x', status: 200, source: 'network', errorKind: null, requestId: 'r1' })
    expect(missing).toMatchObject({ status: 404, errorKind: 'not-found', requestId: 'r2', chaos: 'Stale chunks' })
    expect(dropped).toMatchObject({ status: 0, errorKind: expect.stringMatching(/^(network|offline)$/), source: null })
  })

  it('is a bounded ring', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })))
    for (let i = 0; i < 305; i += 1) await call({ query: { i } })
    expect(useNetLog.getState().entries).toHaveLength(300)
    expect(useNetLog.getState().entries[0]?.url).toBe('/api/x?i=304')
  })
})
