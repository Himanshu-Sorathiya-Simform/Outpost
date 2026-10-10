import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ORIGIN, API_CACHE, Served, setup, JSON_TYPE, SERVED_AT, json, HEALTHY, URLS } from './sw-harness'

describe('network-only routes', () => {
  const BENCH = '/api/bench/network-only/alpha'
  const benchBody = (hits: number) => json({ strategy: 'network-only', key: 'alpha', rev: 1, hits }, { 'X-Served-At': SERVED_AT })
  let files: Record<string, Served>
  let sw: ReturnType<typeof setup>

  beforeEach(async () => {
    files = { ...HEALTHY, [BENCH]: benchBody(1) }
    sw = setup(files)
    await sw.install()
    sw.requested.length = 0
    sw.forwarded.length = 0
  })

  const ask = async (path: string, init: { headers?: Headers } = {}): Promise<Response> => {
    const r = await sw.dispatch({ url: `${ORIGIN}${path}`, ...init })
    if (r === 'not handled') throw new Error(`${path} was not handled`)
    return r
  }
  /** Every key of every cache the worker has written to, as paths. */
  const everyStoredPath = (): string[] => [...sw.stores.values()].flatMap((store) => [...store.keys()]).map((k) => k.replace(ORIGIN, ''))

  describe('the bench route', () => {
    it('goes to the server and is answered stamped as a network answer, with no cache named', async () => {
      const r = await ask(BENCH)
      expect(r.status).toBe(200)
      expect(r.headers.get('x-sw-source')).toBe('network')
      expect(r.headers.get('x-sw-strategy')).toBe('network-only')
      expect(r.headers.get('x-sw-cache')).toBeNull()
      expect(r.headers.get('x-served-at')).toBe(SERVED_AT)
      expect(await r.json()).toMatchObject({ strategy: 'network-only', key: 'alpha' })
      expect(sw.requested.map((q) => q.url)).toEqual([BENCH])
    })

    it('asks the server every time, and the newest answer is what the page gets', async () => {
      await (await ask(BENCH)).text()
      files[BENCH] = benchBody(2)
      expect(await (await ask(BENCH)).json()).toMatchObject({ hits: 2 })
      expect(sw.requested).toHaveLength(2)
    })

    it('bypasses the browser HTTP cache', async () => {
      await ask(BENCH)
      expect(sw.requested[0]?.cache).toBe('no-store')
    })

    it('keeps the headers the page sent, so the server can still name the tab', async () => {
      await ask(BENCH, { headers: new Headers({ 'X-Tab-Id': 'tab-7', Accept: 'application/json' }) })
      expect(sw.forwarded[0]?.get('x-tab-id')).toBe('tab-7')
      expect(sw.forwarded[0]?.get('accept')).toBe('application/json')
    })

    it('never stores anything, however often it is read', async () => {
      for (let i = 0; i < 3; i += 1) await (await ask(BENCH)).text()
      expect(everyStoredPath().some((path) => path.includes('network-only'))).toBe(false)
    })

    it.each([
      ['a 500', { status: 500, type: JSON_TYPE, body: '{"error":{}}' }],
      ['a 404', { status: 404, type: JSON_TYPE, body: '{"error":{}}' }],
      ['a captive portal page', { type: 'text/html', body: '<html>sign in</html>' }],
      ['JSON that does not parse', { type: JSON_TYPE, body: '{"strategy":' }],
    ] as Array<[string, Served]>)('hands over %s exactly as the server sent it', async (_name, reply) => {
      files[BENCH] = reply
      const r = await ask(BENCH)
      expect(r.status).toBe(reply.status ?? 200)
      expect(r.headers.get('x-sw-source')).toBe('network')
      expect(await r.text()).toBe(reply.body)
    })

    it('fails like a plain request when the network is down, even with a stored copy of the same URL on hand', async () => {
      sw.stores.set(API_CACHE, new Map([[`${ORIGIN}${BENCH}`, new Response('{"stale":true}')]]))
      sw.setOffline(true)
      await expect(ask(BENCH)).rejects.toBeInstanceOf(TypeError)
    })

    it('waits for a slow server as long as it takes, with no timeout and no stored substitute', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        files[BENCH] = { ...benchBody(1), delayMs: 40_000 }
        const pending = ask(BENCH)
        await vi.advanceTimersByTimeAsync(40_000)
        expect((await pending).status).toBe(200)
      } finally {
        vi.useRealTimers()
      }
    })

    it.each([
      ['a write', { method: 'POST', url: `${ORIGIN}${BENCH}/bump` }],
      ['a bump', { method: 'POST', url: `${ORIGIN}${BENCH}` }],
      ['a path with a segment after the key', { url: `${ORIGIN}${BENCH}/extra` }],
      ['the route with no key', { url: `${ORIGIN}/api/bench/network-only/` }],
      ['a navigation typed into the address bar', { url: `${ORIGIN}${BENCH}`, mode: 'navigate' }],
      ['another origin', { url: `https://example.com${BENCH}` }],
    ])('does not handle %s', async (_name, request) => {
      expect(await sw.dispatch(request)).toBe('not handled')
    })
  })

  describe('everything else that must never be cached', () => {
    const LIVE = [
      '/api/signal',
      '/api/session',
      '/api/ping',
      '/api/version',
      '/version.json',
      '/sw.js',
      '/api/push/vapid-key',
      '/api/push/subscribe',
      '/api/_lab/state',
      '/api/_lab/events',
      '/api/_lab/chaos/preset/all-clear',
    ]

    it.each(LIVE)('leaves %s to the browser and stores nothing, for every method', async (path) => {
      const before = everyStoredPath().sort()
      for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(await sw.dispatch({ method, url: `${ORIGIN}${path}` }), `${method} ${path}`).toBe('not handled')
      }
      expect(sw.requested).toHaveLength(0)
      expect(everyStoredPath().sort()).toEqual(before)
    })

    it('leaves every write alone, whatever the URL, even on a route a strategy owns', async () => {
      for (const path of ['/api/dispatches', '/api/dispatches/dp-000064', '/api/stations/KRN-07', '/api/inbox/read-all', '/assets/index-AAA.js', '/media/dispatch/dp-000001.svg']) {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
          expect(await sw.dispatch({ method, url: `${ORIGIN}${path}` }), `${method} ${path}`).toBe('not handled')
        }
      }
    })
  })

  describe('the second lock: store() refuses what is on the never-cached list', () => {
    // A separate sandbox that also exposes store() from caching/runtime.ts: no route of the real worker reaches it with such a URL.
    let lock: ReturnType<typeof setup>
    beforeEach(() => {
      lock = setup(HEALTHY, URLS, { internals: true })
    })
    type Store = (target: { readFrom: string[]; writeTo: string; limit: number }, url: URL, response: Response) => Promise<boolean>
    const store = (path: string): Promise<boolean> => {
      const internals = (lock.sandbox as unknown as { __sw: { store: Store } }).__sw
      return internals.store({ readFrom: [API_CACHE], writeTo: API_CACHE, limit: 0 }, new URL(`${ORIGIN}${path}`), new Response('{"x":1}'))
    }

    it.each(['/api/signal', '/api/session', '/api/ping', '/api/version', '/version.json', '/sw.js', '/api/push/subscribe', '/api/_lab/state', '/api/bench/network-only/alpha'])(
      'refuses %s, writes nothing and logs a warning',
      async (path) => {
        expect(await store(path)).toBe(false)
        expect(lock.stores.has(API_CACHE)).toBe(false)
        expect(lock.warnings.at(-1)?.[0]).toContain(path)
      },
    )

    it('still stores a route that is allowed', async () => {
      expect(await store('/api/dispatches')).toBe(true)
      expect(lock.stores.get(API_CACHE)?.size).toBe(1)
    })

    it('matches whole path segments: a name that only starts with the same letters is allowed', async () => {
      expect(await store('/api/signals')).toBe(true)
      expect(await store('/api/sessions')).toBe(true)
    })
  })
})
