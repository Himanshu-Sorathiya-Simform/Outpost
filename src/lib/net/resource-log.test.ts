// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RESOURCE_RING_SIZE, appendResources, categorise, startResourceLog, toResourceEntry, useResourceLog } from './resource-log'

beforeEach(() => useResourceLog.getState().clear())
afterEach(() => vi.unstubAllGlobals())

const timing = (over: Record<string, unknown>) =>
  ({ name: 'http://localhost:3000/assets/app-abc.js', initiatorType: 'script', startTime: 100, duration: 12.6, transferSize: 4200, encodedBodySize: 4000, decodedBodySize: 9000, nextHopProtocol: 'h2', responseStatus: 200, ...over }) as unknown as PerformanceResourceTiming

describe('categorise', () => {
  it.each([
    ['fetch', 'http://x/api/a', 'fetch'],
    ['xmlhttprequest', 'http://x/api/a', 'fetch'],
    ['script', 'http://x/assets/a.js', 'script'],
    ['img', 'http://x/media/a.svg', 'image'],
    ['css', 'http://x/assets/font.woff2', 'font'],
    ['link', 'http://x/assets/app.css?v=1', 'style'],
    ['link', 'http://x/assets/chunk.js', 'script'],
    ['navigation', 'http://x/', 'document'],
    ['other', 'http://x/thing', 'other'],
  ])('%s %s is %s', (initiator, url, expected) => {
    expect(categorise(initiator, url)).toBe(expected)
  })
})

describe('toResourceEntry', () => {
  it('shortens same-origin URLs, rounds times and derives fromCache', () => {
    const e = toResourceEntry(timing({}), 'http://localhost:3000', 1_000_000)
    expect(e).toMatchObject({ path: '/assets/app-abc.js', category: 'script', duration: 13, at: 1_000_100, deliveryType: '', fromCache: false, nextHopProtocol: 'h2' })
  })

  it('flags cache deliveries by deliveryType or by a zero transfer with a body', () => {
    expect(toResourceEntry(timing({ deliveryType: 'cache', transferSize: 300 }), 'http://localhost:3000', 0).fromCache).toBe(true)
    expect(toResourceEntry(timing({ transferSize: 0 }), 'http://localhost:3000', 0).fromCache).toBe(true)
    expect(toResourceEntry(timing({ transferSize: 0, encodedBodySize: 0 }), 'http://localhost:3000', 0).fromCache).toBe(false)
  })

  it('keeps cross-origin URLs whole', () => {
    expect(toResourceEntry(timing({ name: 'https://fonts.example/a.woff2' }), 'http://localhost:3000', 0).path).toBe('https://fonts.example/a.woff2')
  })
})

describe('appendResources', () => {
  it('puts the newest first and is bounded', () => {
    const batch = (from: number, n: number) => Array.from({ length: n }, (_, i) => toResourceEntry(timing({ name: `http://localhost:3000/r${from + i}` }), 'http://localhost:3000', 0))
    appendResources(batch(0, 3))
    expect(useResourceLog.getState().entries.map((e) => e.path)).toEqual(['/r2', '/r1', '/r0'])
    appendResources(batch(3, RESOURCE_RING_SIZE + 20))
    expect(useResourceLog.getState().entries).toHaveLength(RESOURCE_RING_SIZE)
    expect(useResourceLog.getState().entries[0]?.path).toBe(`/r${RESOURCE_RING_SIZE + 22}`)
  })

  it('ignores an empty batch', () => {
    appendResources([])
    expect(useResourceLog.getState().entries).toEqual([])
  })
})

describe('appendResources and restarts', () => {
  it('does not list a resource twice when a restarted observer replays the buffered entries', () => {
    const replayed = () => toResourceEntry(timing({ name: 'http://localhost:3000/assets/app-abc.js', startTime: 100 }), 'http://localhost:3000', 0)
    appendResources([replayed()])
    appendResources([replayed()])
    expect(useResourceLog.getState().entries).toHaveLength(1)
    appendResources([toResourceEntry(timing({ startTime: 450 }), 'http://localhost:3000', 0)])
    expect(useResourceLog.getState().entries).toHaveLength(2)
  })
})

describe('startResourceLog', () => {
  it('does nothing, without throwing, where PerformanceObserver does not list its entry types', () => {
    class Bare {
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('PerformanceObserver', Bare)
    const stop = startResourceLog()
    expect(() => stop()).not.toThrow()
  })
})
