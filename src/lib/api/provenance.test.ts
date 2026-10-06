import { describe, expect, it } from 'vitest'
import { decideSource, findResourceTiming, type TimingInfo } from './provenance'

const timing = (over: Partial<TimingInfo> = {}): TimingInfo => ({ transferSize: 812, encodedBodySize: 400, decodedBodySize: 1200, deliveryType: '', ...over })

describe('decideSource precedence', () => {
  it.each([
    ['cache', 'sw-cache'],
    ['network', 'sw-network'],
    ['revalidated', 'sw-network'],
    ['fallback', 'sw-fallback'],
    ['cache-miss', 'sw-fallback'],
    [' Cache ', 'sw-cache'],
  ])('header X-SW-Source=%s gives %s', (header, source) => {
    const result = decideSource({ swSource: header, timing: null, hasController: false })
    expect(result.source).toBe(source)
    expect(result.reason).toMatch(/^header:X-SW-Source=/)
  })

  it('lets the header beat contradicting timing evidence', () => {
    const result = decideSource({ swSource: 'network', timing: timing({ transferSize: 0, deliveryType: 'cache' }), hasController: true })
    expect(result.source).toBe('sw-network')
  })

  it('reads deliveryType cache with a controller as sw-cache, without one as http-cache', () => {
    expect(decideSource({ swSource: null, timing: timing({ deliveryType: 'cache' }), hasController: true })).toMatchObject({ source: 'sw-cache', reason: 'heuristic:deliveryType=cache+controller' })
    expect(decideSource({ swSource: null, timing: timing({ deliveryType: 'cache' }), hasController: false })).toMatchObject({ source: 'http-cache', reason: 'heuristic:deliveryType=cache' })
  })

  it('reads transferSize 0 with a body as a cache hit', () => {
    expect(decideSource({ swSource: null, timing: timing({ transferSize: 0 }), hasController: false })).toMatchObject({ source: 'http-cache', reason: 'heuristic:transferSize=0' })
    expect(decideSource({ swSource: null, timing: timing({ transferSize: 0 }), hasController: true }).source).toBe('sw-cache')
  })

  it('does not call a zero-byte body a cache hit', () => {
    expect(decideSource({ swSource: null, timing: timing({ transferSize: 0, encodedBodySize: 0 }), hasController: false }).source).toBe('network')
  })

  it('falls back to network, with a reason, when nothing indicates a cache', () => {
    expect(decideSource({ swSource: null, timing: timing(), hasController: true })).toMatchObject({ source: 'network', reason: 'default:transferSize=812' })
    expect(decideSource({ swSource: null, timing: null, hasController: false })).toMatchObject({ source: 'network', reason: 'default:no-timing-entry' })
  })

  it('ignores an unrecognised header value but mentions it', () => {
    const result = decideSource({ swSource: 'mystery', timing: null, hasController: false })
    expect(result.source).toBe('network')
    expect(result.reason).toContain('mystery')
  })
})

describe('findResourceTiming', () => {
  const entry = (startTime: number, transferSize = 0) =>
    ({ name: 'http://localhost/api/x', startTime, transferSize, encodedBodySize: 10, decodedBodySize: 20, deliveryType: 'cache' }) as unknown as PerformanceResourceTiming

  it('picks the entry that started closest to this request, among several for the same URL', () => {
    const perf = { getEntriesByName: () => [entry(10, 1), entry(500, 2), entry(905, 3)] }
    expect(findResourceTiming('http://localhost/api/x', 900, 950, perf)?.transferSize).toBe(3)
  })

  it('ignores entries from outside the request window', () => {
    const perf = { getEntriesByName: () => [entry(10), entry(5000)] }
    expect(findResourceTiming('http://localhost/api/x', 900, 950, perf)).toBeNull()
  })

  it('reports deliveryType and sizes', () => {
    const perf = { getEntriesByName: () => [entry(900)] }
    expect(findResourceTiming('http://localhost/api/x', 900, 950, perf)).toEqual({ transferSize: 0, encodedBodySize: 10, decodedBodySize: 20, deliveryType: 'cache' })
  })

  it('never throws', () => {
    expect(findResourceTiming('x', 0, 1, { getEntriesByName: () => { throw new Error('buffer cleared') } })).toBeNull()
    expect(findResourceTiming('x', 0, 1, undefined)).toBeNull()
    expect(findResourceTiming('x', 0, 1, {} as unknown as Pick<Performance, 'getEntriesByName'>)).toBeNull()
  })
})
