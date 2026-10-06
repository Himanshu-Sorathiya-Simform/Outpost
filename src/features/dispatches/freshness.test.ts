import { describe, expect, it } from 'vitest'
import type { ResponseMeta } from '@/lib/api/types'
import { AppError } from '@/lib/errors/app-error'
import { dataMoment, describeFreshness } from './freshness'

const meta = (over: Partial<ResponseMeta> = {}): ResponseMeta => ({
  url: '/api/dispatches',
  method: 'GET',
  status: 200,
  requestId: null,
  servedAt: '2026-09-30T10:00:00.000Z',
  servedBy: null,
  fetchedAt: '2026-09-30T10:00:01.000Z',
  durationMs: 12,
  source: 'network',
  sourceReason: 'test',
  dataAgeMs: 1000,
  etag: null,
  cacheControl: null,
  ageHeader: null,
  rev: null,
  apiVersion: 1,
  chaos: null,
  swSource: null,
  swStrategy: null,
  swCache: null,
  swCachedAt: null,
  bytes: null,
  transferSize: null,
  deliveryType: null,
  redirected: false,
  responseType: 'basic',
  ...over,
})

const base = { hasData: true, refetchError: null, paused: false, pageLoadedAt: Date.parse('2026-09-30T09:00:00.000Z') }

describe('describeFreshness', () => {
  it('says nothing about a fresh network answer', () => {
    expect(describeFreshness({ ...base, meta: meta() })).toBeNull()
  })

  it('says nothing when there is no data', () => {
    expect(describeFreshness({ ...base, hasData: false, meta: meta({ source: 'sw-cache' }) })).toBeNull()
  })

  it('names a failed refresh and keeps the age of what is on screen', () => {
    const refetchError = new AppError({ kind: 'network', message: 'fetch failed' })
    const result = describeFreshness({ ...base, meta: meta(), refetchError })
    expect(result?.cause).toBe('refresh-failed')
    expect(result?.detail).toBe(refetchError.userMessage)
    expect(result?.since).toBe('2026-09-30T10:00:00.000Z')
  })

  it('does not read "this action needs a connection" for a failed refresh', () => {
    const refetchError = new AppError({ kind: 'offline', message: 'offline' })
    expect(describeFreshness({ ...base, meta: meta(), refetchError })?.detail).toBe('No signal.')
  })

  it('reports a paused query', () => {
    expect(describeFreshness({ ...base, meta: meta(), paused: true })?.cause).toBe('paused')
  })

  it.each(['sw-cache', 'sw-fallback'] as const)('flags a %s answer', (source) => {
    expect(describeFreshness({ ...base, meta: meta({ source }) })?.cause).toBe('cache')
  })

  it('flags an old http-cache answer but not one the relay stamped seconds ago (a 304 revalidation)', () => {
    expect(describeFreshness({ ...base, meta: meta({ source: 'http-cache', dataAgeMs: 120_000 }) })?.cause).toBe('cache')
    expect(describeFreshness({ ...base, meta: meta({ source: 'http-cache', dataAgeMs: 40 }) })).toBeNull()
  })

  it('prefers the time the service worker stored the entry', () => {
    const m = meta({ source: 'sw-cache', swCachedAt: '2026-09-30T08:00:00.000Z' })
    expect(dataMoment(m)).toBe('2026-09-30T08:00:00.000Z')
  })

  it('flags data fetched before this page started as restored', () => {
    const result = describeFreshness({ ...base, meta: meta({ fetchedAt: '2026-09-30T08:59:00.000Z' }) })
    expect(result?.cause).toBe('restored')
  })

  it('lets a failed refresh outrank a cache source', () => {
    const refetchError = new AppError({ kind: 'timeout', message: 'slow' })
    expect(describeFreshness({ ...base, meta: meta({ source: 'sw-cache' }), refetchError })?.cause).toBe('refresh-failed')
  })
})
