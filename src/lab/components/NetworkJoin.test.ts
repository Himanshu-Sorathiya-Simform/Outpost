import { describe, expect, it } from 'vitest'
import type { RequestLogEntry } from '@shared/contracts'
import type { NetLogEntry } from '@/lib/api/net-log'
import { joinLogs, nextPendingExpiry, type JoinContext } from './NetworkJoin'
import { applyFilters, NO_FILTERS, percentile, summarise } from './NetworkStats'

const T0 = Date.parse('2026-09-30T10:00:00.000Z')
const TAB = 'tab-own'

const ctx: JoinContext = { tabId: TAB, now: T0 + 60_000, feedOpen: true, clearedAt: 0, pageStart: 0, ringSize: 500 }

let seq = 0
function server(over: Partial<RequestLogEntry> = {}): RequestLogEntry {
  seq += 1
  return {
    seq,
    ts: new Date(T0 + 200).toISOString(),
    method: 'GET',
    path: '/api/stations',
    status: 200,
    durationMs: 40,
    bytes: 900,
    requestId: `r-${seq}`,
    dest: 'empty',
    mode: 'cors',
    site: 'same-origin',
    tab: TAB,
    chaos: null,
    notes: [],
    reqHeaders: {},
    ...over,
  }
}

let id = 0
function client(over: Partial<NetLogEntry> = {}): NetLogEntry {
  id += 1
  return { id, startedAt: T0, method: 'GET', url: '/api/stations', status: 200, durationMs: 200, source: 'network', errorKind: null, requestId: null, chaos: null, bytes: 900, ...over }
}

describe('joinLogs', () => {
  it('joins by request id and calls it NETWORK', () => {
    const s = server()
    const [row] = joinLogs([client({ requestId: s.requestId })], [s], ctx)
    expect(row?.cls).toBe('network')
    expect(row?.link).toBe('id')
    expect(row?.server?.seq).toBe(s.seq)
  })

  it('calls a response with no server entry CACHE', () => {
    const [row] = joinLogs([client({ requestId: 'r-gone', source: 'sw-cache', durationMs: 4 })], [], ctx)
    expect(row?.cls).toBe('cache')
    expect(row?.anomaly).toBe(true)
  })

  it('treats a request id that finished long before the request began as a replayed cache answer', () => {
    const old = server({ ts: new Date(T0 - 60_000).toISOString() })
    const rows = joinLogs([client({ requestId: old.requestId })], [old], ctx)
    const cached = rows.find((r) => r.client)
    expect(cached?.cls).toBe('cache')
    expect(cached?.link).toBe('replay')
    expect(cached?.notes).toContain('replayed response')
    expect(rows.find((r) => r.server)?.cls).toBe('server-only')
  })

  it('lets one server entry answer only one client entry', () => {
    const s = server()
    const rows = joinLogs([client({ requestId: s.requestId, startedAt: T0 + 5000, durationMs: 10 }), client({ requestId: s.requestId })], [s], ctx)
    const classes = rows.map((r) => r.cls).sort()
    expect(classes).toEqual(['cache', 'network'])
  })

  it('joins a failure with no request id heuristically by tab, path and time', () => {
    const s = server({ status: 0, chaos: 'Dropped writes', method: 'POST', path: '/api/dispatches', ts: new Date(T0 + 150).toISOString() })
    const [row] = joinLogs([client({ method: 'POST', url: '/api/dispatches', status: 0, errorKind: 'network', durationMs: 150 })], [s], ctx)
    expect(row?.link).toBe('heuristic')
    expect(row?.cls).toBe('chaos')
    expect(row?.notes).toContain('heuristic join')
    expect(row?.failed).toBe(true)
  })

  it('does not heuristically join across tabs or outside the window', () => {
    const otherTab = server({ tab: 'tab-other' })
    const late = server({ ts: new Date(T0 + 30_000).toISOString() })
    const rows = joinLogs([client({ status: 0, errorKind: 'network' })], [otherTab, late], ctx)
    expect(rows.find((r) => r.client)?.cls).toBe('pre-server')
    expect(rows.filter((r) => r.cls === 'server-only')).toHaveLength(2)
  })

  it('says a same-tab server-only GET right after a CACHE row is probably the worker revalidating', () => {
    const revalidation = server({ ts: new Date(T0 + 300).toISOString(), durationMs: 40, status: 304 })
    const rows = joinLogs([client({ requestId: 'r-gone', source: 'sw-cache', durationMs: 4 })], [revalidation], ctx)
    const row = rows.find((r) => r.server)
    expect(row?.cls).toBe('server-only')
    expect(row?.reason).toMatch(/service worker revalidating/)
  })

  it('keeps static page resources out of the SERVER ONLY count', () => {
    const asset = server({ path: '/assets/app.js', dest: 'script', tab: null })
    const stray = server({ path: '/api/stations', tab: null })
    const rows = joinLogs([], [asset, stray], ctx)
    const summary = summarise(rows, [])
    expect(summary.counts['server-only']).toBe(1)
    expect(summary.pageResources).toBe(1)
  })

  it('classes a failed client with no server record as PRE-SERVER FAIL', () => {
    const [row] = joinLogs([client({ status: 0, errorKind: 'offline', durationMs: 3 })], [], ctx)
    expect(row?.cls).toBe('pre-server')
  })

  it('reports no verdict while the server entry may still be in flight', () => {
    const fresh = { ...ctx, now: T0 + 300 }
    const [row] = joinLogs([client({ requestId: 'r-late' })], [], fresh)
    expect(row?.cls).toBe('no-verdict')
    expect(nextPendingExpiry([row as never], fresh.now)).toBe(T0 + 200 + 2000)
  })

  it('reports no verdict when the feed is down and the server log stops earlier', () => {
    const [row] = joinLogs([client()], [], { ...ctx, feedOpen: false })
    expect(row?.cls).toBe('no-verdict')
  })

  it('reports no verdict for requests that predate a clear of the server log', () => {
    const [row] = joinLogs([client()], [], { ...ctx, clearedAt: T0 + 1000 })
    expect(row?.cls).toBe('no-verdict')
  })

  it('flags a server entry without a tab id as SERVER ONLY, but not a page resource', () => {
    const revalidation = server({ tab: null, path: '/api/handbook' })
    const asset = server({ tab: null, path: '/assets/app-1.js', dest: 'script' })
    const rows = joinLogs([], [revalidation, asset], ctx)
    expect(rows.find((r) => r.path === '/api/handbook')?.anomaly).toBe(true)
    expect(rows.find((r) => r.path === '/assets/app-1.js')?.anomaly).toBe(false)
  })

  it('does not call a 304 answered as 200 a status mismatch', () => {
    const s = server({ status: 304, notes: ['etag-304'] })
    const [row] = joinLogs([client({ requestId: s.requestId })], [s], ctx)
    expect(row?.statusDiffers).toBe(false)
    expect(row?.cls).toBe('network')
  })

  it('flags a real status mismatch', () => {
    const s = server({ status: 500 })
    const [row] = joinLogs([client({ requestId: s.requestId, status: 200 })], [s], ctx)
    expect(row?.statusDiffers).toBe(true)
  })
})

describe('filters and summary', () => {
  it('filters by class, status class, method, text and probes', () => {
    const s = server()
    const rows = joinLogs([client({ requestId: s.requestId }), client({ method: 'POST', url: '/api/ping', status: 204, requestId: 'r-x' })], [s], ctx)
    expect(applyFilters(rows, { ...NO_FILTERS, method: 'POST' })).toHaveLength(1)
    expect(applyFilters(rows, { ...NO_FILTERS, hideProbes: true })).toHaveLength(1)
    expect(applyFilters(rows, { ...NO_FILTERS, text: 'STATIONS' })).toHaveLength(1)
    expect(applyFilters(rows, { ...NO_FILTERS, cls: 'cache' })).toHaveLength(1)
    expect(applyFilters(rows, { ...NO_FILTERS, status: '2xx' })).toHaveLength(2)
    expect(applyFilters(rows, { ...NO_FILTERS, status: '4xx' })).toHaveLength(0)
  })

  it('computes nearest-rank percentiles', () => {
    expect(percentile([], 50)).toBeNull()
    expect(percentile([10, 20, 30, 40], 50)).toBe(20)
    expect(percentile([10, 20, 30, 40], 95)).toBe(40)
  })

  it('counts classes and the cache ratio', () => {
    const s = server()
    const c = [client({ requestId: s.requestId }), client({ requestId: 'r-none', durationMs: 5 })]
    const rows = joinLogs(c, [s], ctx)
    const sum = summarise(rows, c)
    expect(sum.counts.network).toBe(1)
    expect(sum.counts.cache).toBe(1)
    expect(sum.cacheRatio).toBe(0.5)
  })
})
