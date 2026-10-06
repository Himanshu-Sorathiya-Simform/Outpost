// @vitest-environment jsdom
import type { Query } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorCenter, useErrorCenter } from '@/lib/errors/center'
import { useToastStore } from '@/lib/notify'
import { pwa, usePwaStore } from '@/pwa'
import { PwaNotImplementedError } from '@/pwa/errors'
import { SW_MESSAGE_RING_SIZE, handleSwMessage, safeNavigationTarget, sendToSw, startSwMessageBridge, urlMatches, useSwMessageLog, type BridgeDeps } from './sw-messages'

type Predicate = (q: Query) => boolean

function makeDeps(queries: Array<{ url?: unknown }> = []) {
  const all = queries.map((q) => ({ meta: q.url === undefined ? undefined : { url: q.url } }) as unknown as Query)
  const invalidateQueries = vi.fn<(filters: { predicate: Predicate }) => Promise<void>>().mockResolvedValue()
  const deps: BridgeDeps = {
    navigate: vi.fn(),
    queryClient: {
      invalidateQueries,
      getQueryCache: () => ({ findAll: ({ predicate }: { predicate: Predicate }) => all.filter(predicate) }),
    } as unknown as BridgeDeps['queryClient'],
  }
  const invalidated = (): Query[] => {
    const call = invalidateQueries.mock.calls[0]
    return call ? all.filter(call[0].predicate) : []
  }
  return { deps, invalidated, invalidateQueries }
}

const entries = () => useSwMessageLog.getState().entries

beforeEach(() => {
  useSwMessageLog.getState().clear()
  useToastStore.getState().clear()
  errorCenter.clear()
  usePwaStore.setState({ queuedCount: 0 })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('validation and logging', () => {
  it('keeps invalid messages in the log with the reason, and does nothing else', () => {
    const { deps, invalidateQueries } = makeDeps()
    handleSwMessage({ type: 'cache-updated' }, 'service-worker', deps)
    handleSwMessage('just text', 'broadcast-channel', deps)
    handleSwMessage({ type: 'made-up', x: 1 }, 'service-worker', deps)
    expect(entries()).toHaveLength(3)
    expect(entries()[2]).toMatchObject({ valid: false, type: 'cache-updated', channel: 'service-worker', direction: 'in' })
    expect(entries()[2]?.reason).toMatch(/url/)
    expect(entries()[1]).toMatchObject({ valid: false, type: null, raw: 'just text' })
    expect(entries()[0]).toMatchObject({ valid: false, type: 'made-up' })
    expect(invalidateQueries).not.toHaveBeenCalled()
    expect(useErrorCenter.getState().records).toHaveLength(0)
  })

  it('logs valid messages with the raw payload and channel', () => {
    const { deps } = makeDeps()
    const raw = { type: 'sw-version', version: 'v3', caches: ['api-v3'] }
    handleSwMessage(raw, 'broadcast-channel', deps)
    expect(entries()[0]).toMatchObject({ valid: true, reason: null, type: 'sw-version', raw, channel: 'broadcast-channel', note: null })
  })

  it('is a bounded ring', () => {
    const { deps } = makeDeps()
    for (let i = 0; i < SW_MESSAGE_RING_SIZE + 10; i += 1) handleSwMessage({ type: 'log', message: `m${i}` }, 'service-worker', deps)
    expect(entries()).toHaveLength(SW_MESSAGE_RING_SIZE)
  })

  it('survives a reaction that throws', () => {
    const { deps } = makeDeps()
    deps.navigate = () => {
      throw new Error('router gone')
    }
    handleSwMessage({ type: 'navigate', url: '/inbox' }, 'service-worker', deps)
    expect(entries()[0]?.note).toMatch(/reaction failed/)
    expect(useErrorCenter.getState().records[0]?.error.message).toBe('router gone')
  })
})

describe('reactions', () => {
  it('cache-updated invalidates queries whose meta.url matches by pathname or prefix', () => {
    const { deps, invalidated } = makeDeps([
      { url: '/api/dispatches' },
      { url: '/api/dispatches/dp-000001' },
      { url: '/api/dispatches?limit=12' },
      { url: '/api/stations' },
      { url: '/api/dispatchesX' },
      { url: 42 },
      {},
    ])
    handleSwMessage({ type: 'cache-updated', url: 'http://localhost:3000/api/dispatches?cursor=abc', strategy: 'stale-while-revalidate' }, 'service-worker', deps)
    expect(invalidated().map((q) => q.meta?.url)).toEqual(['/api/dispatches', '/api/dispatches/dp-000001', '/api/dispatches?limit=12'])
    expect(entries()[0]?.note).toBe('invalidated 3 queries')
  })

  it('sync-complete invalidates feed and inbox, refreshes the queued count and toasts', async () => {
    vi.spyOn(pwa.sync, 'listQueued').mockResolvedValue([{}, {}] as never)
    const { deps, invalidated } = makeDeps([{ url: '/api/dispatches' }, { url: '/api/inbox/summary' }, { url: '/api/stations' }])
    handleSwMessage({ type: 'sync-complete', tag: 'outbox-flush', succeeded: ['a'], failed: ['b'] }, 'service-worker', deps)
    expect(invalidated()).toHaveLength(2)
    await vi.waitFor(() => expect(usePwaStore.getState().queuedCount).toBe(2))
    expect(useToastStore.getState().toasts[0]).toMatchObject({ tone: 'warn', title: 'Outbox partly sent', message: '1 filed, 1 still waiting.' })
  })

  it('sync-complete copes with a stub listQueued and stays quiet when nothing was sent', async () => {
    vi.spyOn(pwa.sync, 'listQueued').mockRejectedValue(new PwaNotImplementedError('sync.listQueued'))
    const { deps } = makeDeps()
    handleSwMessage({ type: 'sync-complete', tag: 't', succeeded: [], failed: [] }, 'service-worker', deps)
    await new Promise((r) => setTimeout(r, 0))
    expect(usePwaStore.getState().queuedCount).toBe(0)
    expect(useToastStore.getState().toasts).toHaveLength(0)
    expect(useErrorCenter.getState().records).toHaveLength(0)
  })

  it('periodic-sync-complete invalidates digest and inbox', () => {
    const { deps, invalidated } = makeDeps([{ url: '/api/digest' }, { url: '/api/inbox/summary' }, { url: '/api/dispatches' }])
    handleSwMessage({ type: 'periodic-sync-complete', tag: 'digest-refresh', newCount: 2 }, 'service-worker', deps)
    expect(invalidated().map((q) => q.meta?.url)).toEqual(['/api/digest', '/api/inbox/summary'])
  })

  it('navigate follows same-origin targets only', () => {
    const { deps } = makeDeps()
    handleSwMessage({ type: 'navigate', url: '/log/dp-000123?x=1#top' }, 'service-worker', deps)
    handleSwMessage({ type: 'navigate', url: `${location.origin}/inbox` }, 'service-worker', deps)
    handleSwMessage({ type: 'navigate', url: 'https://evil.example/phish' }, 'service-worker', deps)
    handleSwMessage({ type: 'navigate', url: '//evil.example/phish' }, 'service-worker', deps)
    handleSwMessage({ type: 'navigate', url: 'javascript:alert(1)' }, 'service-worker', deps)
    expect(deps.navigate).toHaveBeenCalledTimes(2)
    expect(deps.navigate).toHaveBeenNthCalledWith(1, '/log/dp-000123?x=1#top')
    expect(deps.navigate).toHaveBeenNthCalledWith(2, '/inbox')
    expect(entries()[0]?.note).toMatch(/navigation ignored/)
  })

  it('push-received toasts with an Open action and refreshes the inbox; silent pushes do not toast', () => {
    const payload = { v: 1, kind: 'dispatch', title: 'Urgent: mast icing', body: 'KRN-07', url: '/log/dp-000123', tag: null, dispatchId: 'dp-000123', badgeCount: 4, icon: '/icons/icon-192.png', image: null, actions: [], requireInteraction: false, silent: false, sentAt: '2026-01-01T00:00:00.000Z' }
    const { deps, invalidated } = makeDeps([{ url: '/api/inbox/summary' }])
    handleSwMessage({ type: 'push-received', payload }, 'service-worker', deps)
    expect(invalidated()).toHaveLength(1)
    const toast = useToastStore.getState().toasts[0]
    expect(toast).toMatchObject({ title: 'Urgent: mast icing', message: 'KRN-07' })
    toast?.action?.run()
    expect(deps.navigate).toHaveBeenCalledWith('/log/dp-000123')

    useToastStore.getState().clear()
    handleSwMessage({ type: 'push-received', payload: { ...payload, kind: 'silent-badge', silent: true } }, 'service-worker', deps)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('sw-version and log are log-only', () => {
    const { deps, invalidateQueries } = makeDeps()
    handleSwMessage({ type: 'sw-version', version: 'v1' }, 'service-worker', deps)
    handleSwMessage({ type: 'log', message: 'hi' }, 'service-worker', deps)
    expect(invalidateQueries).not.toHaveBeenCalled()
    expect(deps.navigate).not.toHaveBeenCalled()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})

describe('url helpers', () => {
  it('urlMatches compares pathnames, treating the worker URL as a segment prefix', () => {
    expect(urlMatches('/api/a?x=1', '/api/a')).toBe(true)
    expect(urlMatches('/api/a/b', '/api/a')).toBe(true)
    expect(urlMatches('/api/ab', '/api/a')).toBe(false)
    expect(urlMatches('/api/a', '/api/a/b')).toBe(false)
    expect(urlMatches(undefined, '/api/a')).toBe(false)
  })

  it('urlMatches does not let the site root, or a trailing slash, change what a worker URL means', () => {
    // A worker that reports '/' (the app shell was revalidated) is not saying every API response changed.
    expect(urlMatches('/api/a', '/')).toBe(false)
    expect(urlMatches('/api/a', '')).toBe(false)
    expect(urlMatches('/', '/')).toBe(true)
    expect(urlMatches('/api/a', '/api/a/')).toBe(true)
    expect(urlMatches('/api/a/', '/api/a')).toBe(true)
    expect(urlMatches('/api/a/b', '/api/a/')).toBe(true)
  })

  it('safeNavigationTarget never returns a protocol-relative path', () => {
    // Dot segments are resolved by the URL parser, leaving '//evil.test', which a router or history.pushState would read as another origin.
    expect(safeNavigationTarget('/.//evil.test/x')).toBe('/evil.test/x')
    expect(safeNavigationTarget('/a/..//evil.test')).toBe('/evil.test')
    expect(safeNavigationTarget('//evil.test')).toBeNull()
    expect(safeNavigationTarget('/\\evil.test')).toBeNull()
    expect(safeNavigationTarget('javascript:alert(1)')).toBeNull()
    expect(safeNavigationTarget('/%2F/evil.test')).toBe('/%2F/evil.test')
  })

  it('safeNavigationTarget normalises and rejects', () => {
    expect(safeNavigationTarget('/a?b=1#c')).toBe('/a?b=1#c')
    expect(safeNavigationTarget('https://elsewhere.test/a')).toBeNull()
    expect(safeNavigationTarget('http://[bad')).toBeNull()
  })
})

describe('sendToSw', () => {
  it('returns false and logs why when nothing controls the page', () => {
    expect(sendToSw({ type: 'ping', nonce: 'n1' })).toBe(false)
    expect(entries()[0]).toMatchObject({ direction: 'out', channel: 'page', type: 'ping', note: 'not sent: no controlling service worker' })
  })

  it('posts to the controller and logs the outgoing message', () => {
    const postMessage = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: { postMessage } } })
    expect(sendToSw({ type: 'skip-waiting' })).toBe(true)
    expect(postMessage).toHaveBeenCalledWith({ type: 'skip-waiting' })
    expect(entries()[0]).toMatchObject({ direction: 'out', valid: true, note: null })
  })

  it('reports a postMessage failure instead of throwing', () => {
    const postMessage = vi.fn(() => {
      throw new DOMException('cannot clone', 'DataCloneError')
    })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: { postMessage } } })
    expect(sendToSw({ type: 'skip-waiting' })).toBe(false)
    expect(entries()[0]?.note).toBe('not sent: postMessage threw')
  })
})

describe('startSwMessageBridge', () => {
  it('listens on the service worker container and the BroadcastChannel, and stops cleanly', async () => {
    const container = new EventTarget() as EventTarget & { startMessages: () => void }
    container.startMessages = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container })
    const navigate = vi.fn()
    const stop = startSwMessageBridge({ navigate })
    expect(container.startMessages).toHaveBeenCalled()

    container.dispatchEvent(new MessageEvent('message', { data: { type: 'navigate', url: '/inbox' } }))
    expect(navigate).toHaveBeenCalledWith('/inbox')
    expect(entries()[0]).toMatchObject({ channel: 'service-worker', valid: true })

    container.dispatchEvent(new Event('messageerror'))
    expect(entries()[0]).toMatchObject({ valid: false, reason: expect.stringMatching(/messageerror/) })

    const sender = new BroadcastChannel('outpost-sw')
    sender.postMessage({ type: 'log', message: 'via channel' })
    await vi.waitFor(() => expect(entries()[0]).toMatchObject({ channel: 'broadcast-channel', type: 'log' }))
    sender.close()

    stop()
    container.dispatchEvent(new MessageEvent('message', { data: { type: 'navigate', url: '/later' } }))
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('still starts where the container has no startMessages()', () => {
    const container = new EventTarget()
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container })
    const navigate = vi.fn()
    const stop = startSwMessageBridge({ navigate })
    container.dispatchEvent(new MessageEvent('message', { data: { type: 'navigate', url: '/inbox' } }))
    expect(navigate).toHaveBeenCalledWith('/inbox')
    stop()
  })

  it('still listens on the service worker container where the BroadcastChannel cannot be opened', () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new DOMException('opaque origin', 'SecurityError')
        }
      },
    )
    const container = new EventTarget() as EventTarget & { startMessages: () => void }
    container.startMessages = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container })
    const navigate = vi.fn()
    let stop = (): void => undefined
    expect(() => {
      stop = startSwMessageBridge({ navigate })
    }).not.toThrow()
    container.dispatchEvent(new MessageEvent('message', { data: { type: 'navigate', url: '/inbox' } }))
    expect(navigate).toHaveBeenCalledWith('/inbox')
    stop()
  })

  it('is idempotent: two starts register one listener', () => {
    const container = new EventTarget() as EventTarget & { startMessages: () => void }
    container.startMessages = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container })
    const navigate = vi.fn()
    const stopA = startSwMessageBridge({ navigate })
    const stopB = startSwMessageBridge({ navigate })
    container.dispatchEvent(new MessageEvent('message', { data: { type: 'navigate', url: '/inbox' } }))
    expect(navigate).toHaveBeenCalledTimes(1)
    stopA()
    container.dispatchEvent(new MessageEvent('message', { data: { type: 'navigate', url: '/inbox' } }))
    expect(navigate).toHaveBeenCalledTimes(2)
    stopB()
  })
})
