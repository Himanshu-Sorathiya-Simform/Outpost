import { describe, expect, it, vi } from 'vitest'
import { PERIODIC_TAG_DIGEST } from '../shared/sw-protocol'
import { API_CACHE, HEALTHY, JSON_TYPE, ORIGIN, json, setup } from './sw-harness'

const GENERATED = '2026-10-11T10:00:00.000Z'

/** The digest as the server answers it (docs/CONTRACTS.md 8.1), with whatever a test changes. */
const digest = (patch: Record<string, unknown> = {}) => ({ generatedAt: GENERATED, since: null, newCount: 3, urgentCount: 0, unread: 5, items: [], ...patch })
const served = (patch: Record<string, unknown> = {}) => ({ ...HEALTHY, '/api/digest': json(digest(patch)) })

/** Watches every request the worker makes, with its query string, which the harness's own log leaves out. */
function watchRequests(sw: ReturnType<typeof setup>) {
  const calls: Array<{ url: string; cache: string }> = []
  const original = sw.sandbox.fetch as (request: Request) => Promise<Response>
  sw.sandbox.fetch = ((request: Request) => {
    calls.push({ url: request.url.replace(ORIGIN, ''), cache: request.cache })
    return original(request)
  }) as never
  return calls
}

/** Fires `periodicsync` and resolves with what the worker handed to waitUntil: a rejection is the handler failing. */
function fire(sw: ReturnType<typeof setup>, tag = 'digest-refresh'): Promise<unknown> {
  let work: Promise<unknown> = Promise.resolve()
  sw.handler('periodicsync')({ tag, waitUntil: (p: Promise<unknown>) => void (work = p) })
  return work
}

const messagesOf = (sw: ReturnType<typeof setup>, type: string): unknown[] => sw.posted.filter((m) => (m as { type: string }).type === type)

describe('the periodicsync event', () => {
  it('uses the tag the page registers', () => {
    // The worker copies the tag instead of importing it (shared/sw-protocol.ts builds zod schemas); this keeps the two the same.
    expect(PERIODIC_TAG_DIGEST).toBe('digest-refresh')
    expect(setup(HEALTHY).handlers.has('periodicsync')).toBe(true)
  })

  it('ignores a tag that is not digest-refresh: no request, nothing stored', async () => {
    const sw = setup(served())
    const calls = watchRequests(sw)
    await fire(sw, 'something-else')
    expect(calls).toEqual([])
    expect(sw.stores.size).toBe(0)
  })

  it('fetches the digest from the network (HTTP cache bypassed), with no `since` the first time, and tells the pages', async () => {
    const sw = setup(served())
    const calls = watchRequests(sw)
    await fire(sw)
    expect(calls).toEqual([{ url: '/api/digest', cache: 'no-cache' }])
    expect(messagesOf(sw, 'periodic-sync-complete')).toEqual([{ type: 'periodic-sync-complete', tag: 'digest-refresh', newCount: 3 }])
  })

  it('keeps the answer under the plain /api/digest URL in the api bucket', async () => {
    const sw = setup(served())
    await fire(sw)
    const kept = sw.stores.get(API_CACHE)?.get(`${ORIGIN}/api/digest`)
    expect(kept).toBeDefined()
    expect(((await kept?.json()) as { generatedAt: string }).generatedAt).toBe(GENERATED)
  })

  it('sends the generatedAt of the kept digest as `since` the next time', async () => {
    const sw = setup(served())
    const calls = watchRequests(sw)
    await fire(sw)
    await fire(sw)
    expect(calls[1]?.url).toBe(`/api/digest?since=${encodeURIComponent(GENERATED)}`)
  })

  it('falls back to "no since" (the last 24 hours) when what is kept cannot be read, or the bucket was cleared', async () => {
    const sw = setup(served())
    sw.stores.set(API_CACHE, new Map([[`${ORIGIN}/api/digest`, new Response('not json')]]))
    const calls = watchRequests(sw)
    await fire(sw)
    expect(calls[0]?.url).toBe('/api/digest')
  })

  it('falls back to "no since" when the kept digest has no usable generatedAt', async () => {
    const sw = setup(served())
    sw.stores.set(API_CACHE, new Map([[`${ORIGIN}/api/digest`, new Response(JSON.stringify(digest({ generatedAt: 'yesterday-ish' })))]]))
    const calls = watchRequests(sw)
    await fire(sw)
    expect(calls[0]?.url).toBe('/api/digest')
  })
})

describe('the badge and the notification', () => {
  it('sets the app badge to the unread count of the digest, and clears it at 0', async () => {
    const sw = setup(served({ unread: 5 }))
    await fire(sw)
    expect(sw.setAppBadge).toHaveBeenCalledExactlyOnceWith(5)
    const none = setup(served({ unread: 0 }))
    await fire(none)
    expect(none.clearAppBadge).toHaveBeenCalledTimes(1)
  })

  it('says in the worker log that the periodic sync set the badge, not a push', async () => {
    const sw = setup(served({ unread: 5 }))
    await fire(sw)
    const lines = sw.posted.filter((m) => (m as { type: string }).type === 'log').map((m) => (m as { message: string }).message)
    expect(lines).toEqual(['Badge set to 5 by a periodic sync.'])
    const none = setup(served({ unread: 0 }))
    await fire(none)
    expect(none.posted.filter((m) => (m as { type: string }).type === 'log').map((m) => (m as { message: string }).message)).toEqual(['Badge cleared by a periodic sync.'])
  })

  it('shows no notification when nothing urgent is new', async () => {
    const sw = setup(served({ newCount: 4, urgentCount: 0 }))
    sw.setWindows([])
    await fire(sw)
    expect(sw.showNotification).not.toHaveBeenCalled()
  })

  it('shows ONE notification for urgent news, tagged so the next run replaces it, and a click opens the inbox', async () => {
    const sw = setup(served({ newCount: 4, urgentCount: 2, unread: 9 }))
    sw.setWindows([])
    await fire(sw)
    expect(sw.showNotification).toHaveBeenCalledExactlyOnceWith(
      '2 urgent dispatches',
      expect.objectContaining({ body: '4 new since your last look, 2 urgent. 9 unread.', tag: 'digest-urgent', data: { url: '/inbox', dispatchId: null, kind: 'digest' } }),
    )
  })

  it('says "dispatch" for one', async () => {
    const sw = setup(served({ urgentCount: 1 }))
    sw.setWindows([])
    await fire(sw)
    expect(sw.showNotification.mock.calls[0]?.[0]).toBe('1 urgent dispatch')
  })

  it('shows none when a window is visible and focused, but the pages are still told', async () => {
    const sw = setup(served({ urgentCount: 2 }))
    const focused = { focused: true, visibilityState: 'visible', postMessage: (m: unknown) => void sw.posted.push(m) }
    sw.setWindows([focused])
    await fire(sw)
    expect(sw.showNotification).not.toHaveBeenCalled()
    expect(messagesOf(sw, 'periodic-sync-complete')).toHaveLength(1)
  })

  it('a click on that notification opens the inbox, also on its acknowledge action (there is no dispatch to acknowledge)', async () => {
    const sw = setup(served())
    sw.setWindows([])
    let work: Promise<unknown> = Promise.resolve()
    sw.handler('notificationclick')({ notification: { close: vi.fn(), data: { url: '/inbox', dispatchId: null, kind: 'digest' } }, action: 'ack', waitUntil: (p: Promise<unknown>) => void (work = p) })
    await work
    expect(sw.openWindow).toHaveBeenCalledExactlyOnceWith('/inbox')
  })
})

describe('a digest that cannot be used: the handler fails and says nothing', () => {
  async function expectFailure(sw: ReturnType<typeof setup>, reason: RegExp): Promise<void> {
    await expect(fire(sw)).rejects.toThrow(reason)
    expect(messagesOf(sw, 'periodic-sync-complete')).toEqual([])
    expect(sw.setAppBadge).not.toHaveBeenCalled()
    expect(sw.clearAppBadge).not.toHaveBeenCalled()
    expect(sw.showNotification).not.toHaveBeenCalled()
    expect(sw.stores.get(API_CACHE)?.get(`${ORIGIN}/api/digest`)).toBeUndefined()
  }

  it('when the network is down', async () => {
    const sw = setup(served())
    sw.setWindows([])
    sw.setOffline(true)
    await expectFailure(sw, /network did not answer/)
  })

  it.each([[500], [503], [429]])('when the server answers %s', async (status) => {
    const sw = setup({ ...HEALTHY, '/api/digest': { status, type: JSON_TYPE, body: '{}' } })
    sw.setWindows([])
    await expectFailure(sw, /unusable/)
  })

  it('when the answer is an HTML page (a captive portal)', async () => {
    const sw = setup({ ...HEALTHY, '/api/digest': { type: 'text/html', body: '<html>sign in</html>' } })
    sw.setWindows([])
    await expectFailure(sw, /unusable/)
  })

  it('when the body is not JSON', async () => {
    const sw = setup({ ...HEALTHY, '/api/digest': { type: JSON_TYPE, body: '{"gener' } })
    sw.setWindows([])
    await expectFailure(sw, /unusable/)
  })

  it('when the server answers 404 or 422 (a real answer, but not a digest)', async () => {
    const sw = setup({ ...HEALTHY, '/api/digest': { status: 422, type: JSON_TYPE, body: '{"error":{}}' } })
    sw.setWindows([])
    await expectFailure(sw, /answered 422/)
  })

  it.each([
    ['no generatedAt', { generatedAt: undefined }],
    ['a generatedAt that is not a date', { generatedAt: 'soon' }],
    ['a newCount that is a string', { newCount: '3' }],
    ['a negative unread', { unread: -1 }],
    ['an urgentCount that is a fraction', { urgentCount: 1.5 }],
  ])('when the body has %s', async (_name, patch) => {
    const sw = setup(served(patch))
    sw.setWindows([])
    await expectFailure(sw, /without generatedAt/)
  })

  it('keeps what was stored before when a later run fails', async () => {
    const sw = setup(served())
    sw.setWindows([])
    await fire(sw)
    sw.setOffline(true)
    await expect(fire(sw)).rejects.toThrow()
    expect(sw.stores.get(API_CACHE)?.get(`${ORIGIN}/api/digest`)).toBeDefined()
  })

  it('still completes, and tells the pages, when the digest cannot be stored (the next run just looks back further)', async () => {
    const sw = setup(served())
    sw.setWritesFail(true)
    await expect(fire(sw)).resolves.toBeUndefined()
    expect(messagesOf(sw, 'periodic-sync-complete')).toHaveLength(1)
  })

  it('still completes when the badge cannot be set: the badge never fails the run', async () => {
    const sw = setup(served(), undefined, { badgeApi: false })
    await expect(fire(sw)).resolves.toBeUndefined()
    expect(messagesOf(sw, 'periodic-sync-complete')).toHaveLength(1)
  })
})
