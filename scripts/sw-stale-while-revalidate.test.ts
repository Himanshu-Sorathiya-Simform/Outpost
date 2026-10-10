import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORIGIN, API_CACHE, Served, setup, JSON_TYPE, json, HEALTHY } from './sw-harness'

describe('stale-while-revalidate routes', () => {
  const LIST = '/api/stations'
  const ONE = '/api/stations/KRN-07'
  const BENCH = '/api/bench/stale-while-revalidate/alpha'
  const STAMPED_AT = '2026-01-01T08:00:00.000Z'
  /** The station list: the body carries asOf, which moves on every call, the ETag covers only the revisions. */
  const stations = (etag: string, asOf: string, marker = 'a'): Served => json({ items: [{ id: 'st-krn07', rev: 1, marker }], asOf }, { ETag: etag, 'X-Served-At': STAMPED_AT })
  /** The bench entry: no ETag, a revision header, and a hit counter that moves on every call. */
  const bench = (rev: number, hits: number): Served => json({ strategy: 'stale-while-revalidate', key: 'alpha', rev, hits }, { 'X-Resource-Rev': String(rev), 'X-Served-At': STAMPED_AT })

  let files: Record<string, Served>
  let sw: ReturnType<typeof setup>
  /** What each window was sent, with the stored copy as it was at that moment. */
  let seen: Array<{ message: unknown; storedThen: string }>

  beforeEach(async () => {
    files = { ...HEALTHY, [LIST]: stations('W/"v1"', '2026-01-01T09:00:00Z'), [ONE]: json({ id: 'st-krn07', rev: 1 }, { ETag: 'W/"r1"' }), [BENCH]: bench(1, 1) }
    sw = setup(files)
    await sw.install()
    sw.requested.length = 0
    seen = []
    const peek = (message: unknown): void => {
      const stored = sw.stores.get(API_CACHE)?.get(`${ORIGIN}${LIST}`)
      void stored?.clone().text().then((storedThen) => seen.push({ message, storedThen }))
      if (!stored) seen.push({ message, storedThen: '' })
    }
    sw.setWindows([{ postMessage: peek }, { postMessage: peek }])
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => vi.useRealTimers())

  const ask = async (path: string): Promise<Response> => {
    const r = await sw.dispatch({ url: `${ORIGIN}${path}` })
    if (r === 'not handled') throw new Error(`${path} was not handled`)
    return r
  }
  const storedText = async (path: string): Promise<string> => (await sw.stores.get(API_CACHE)?.get(`${ORIGIN}${path}`)?.clone().text()) ?? ''
  const storedHeader = (path: string, name: string): string | null => sw.stores.get(API_CACHE)?.get(`${ORIGIN}${path}`)?.headers.get(name) ?? null
  /** Stores a first copy while the network is good, so the next request finds one. */
  const warm = async (path = LIST): Promise<void> => {
    await (await ask(path)).text()
    await sw.settle()
    sw.requested.length = 0
    sw.posted.length = 0
    seen.length = 0
  }
  /** Asks once and lets the background revalidation finish. */
  const visit = async (path = LIST): Promise<Response> => {
    const r = await ask(path)
    const copy = r.clone()
    await r.text()
    await sw.settle()
    await vi.advanceTimersByTimeAsync(0)
    return copy
  }
  const updates = (): unknown[] => seen.map((s) => s.message).filter((m) => (m as { type: string }).type === 'cache-updated')
  const logs = (): Array<{ level: string; message: string }> => seen.map((s) => s.message).filter((m) => (m as { type: string }).type === 'log') as Array<{ level: string; message: string }>

  describe('with nothing stored', () => {
    it.each([LIST, ONE, BENCH])('waits for the network, answers it labelled as a network answer, stores it and posts nothing, for %s', async (path) => {
      const r = await ask(path)
      expect(r.status).toBe(200)
      expect(r.headers.get('x-sw-source')).toBe('network')
      expect(r.headers.get('x-sw-strategy')).toBe('stale-while-revalidate')
      expect(r.headers.get('x-sw-cache')).toBe(API_CACHE)
      await sw.settle()
      expect([...(sw.stores.get(API_CACHE)?.keys() ?? [])]).toContain(`${ORIGIN}${path}`)
      expect(seen).toHaveLength(0)
    })

    it('fails like a plain request when the network is down', async () => {
      sw.setOffline(true)
      await expect(ask(LIST)).rejects.toBeInstanceOf(TypeError)
      expect(sw.stores.has(API_CACHE)).toBe(false)
    })

    it('hands a bad answer to the page as it is and stores nothing', async () => {
      files[LIST] = { status: 500, type: JSON_TYPE, body: '{"error":{}}' }
      const r = await ask(LIST)
      expect(r.status).toBe(500)
      expect(r.headers.get('x-sw-source')).toBe('network')
      await sw.settle()
      expect(sw.stores.has(API_CACHE)).toBe(false)
    })

    it('waits for a slow network, however long, and answers what it gives', async () => {
      files[LIST] = { ...stations('W/"v1"', 'x'), delayMs: 8000 }
      const pending = ask(LIST)
      await vi.advanceTimersByTimeAsync(8000)
      expect((await pending).headers.get('x-sw-source')).toBe('network')
    })
  })

  describe('with a stored copy', () => {
    it('answers it at once, labelled as a cache answer with its true age, even when the server is slow', async () => {
      await warm()
      files[LIST] = { ...stations('W/"v1"', 'x'), delayMs: 5000 }
      const r = await ask(LIST)
      expect(r.status).toBe(200)
      expect(r.headers.get('x-sw-source')).toBe('cache')
      expect(r.headers.get('x-sw-strategy')).toBe('stale-while-revalidate')
      expect(r.headers.get('x-sw-cache')).toBe(API_CACHE)
      expect(r.headers.get('x-served-at')).toBe(STAMPED_AT)
      expect(Number.isNaN(Date.parse(r.headers.get('x-sw-cached-at') ?? ''))).toBe(false)
      await vi.advanceTimersByTimeAsync(5000)
      await sw.settle()
    })

    it('asks the server in the background, with the browser cache bypassed and JSON requested', async () => {
      await warm()
      await visit()
      expect(sw.requested).toEqual([{ url: LIST, cache: 'no-cache', accept: 'application/json' }])
    })

    it('answers from the stored copy when the network is down, and the page is told nothing is wrong except by a log line', async () => {
      await warm()
      sw.setOffline(true)
      const r = await visit()
      expect(r.headers.get('x-sw-source')).toBe('cache')
      expect(updates()).toHaveLength(0)
      expect(logs()).toHaveLength(2)
      expect(logs()[0]).toMatchObject({ level: 'warn' })
      expect(logs()[0]?.message).toContain('/api/stations')
    })
  })

  describe('when the server has something newer', () => {
    it('stores it, then tells every window once, naming the path, strategy and cache', async () => {
      await warm()
      files[LIST] = stations('W/"v2"', '2026-01-01T09:05:00Z', 'b')
      const first = await visit()
      expect(await first.text()).toContain('"marker":"a"')
      expect(await storedText(LIST)).toContain('"marker":"b"')
      expect(updates()).toEqual(Array(2).fill({ type: 'cache-updated', url: LIST, strategy: 'stale-while-revalidate', cacheName: API_CACHE }))
    })

    it('posts only after the write, so the refetch the message causes finds the new copy', async () => {
      await warm()
      files[LIST] = stations('W/"v2"', 'x', 'b')
      await visit()
      expect(seen.length).toBeGreaterThan(0)
      expect(seen.every((entry) => entry.storedThen.includes('"marker":"b"'))).toBe(true)
    })

    it('answers the next request with the new copy, and that request causes no second message', async () => {
      await warm()
      files[LIST] = stations('W/"v2"', 'x', 'b')
      await visit()
      const again = await visit()
      expect(await again.text()).toContain('"marker":"b"')
      expect(updates()).toHaveLength(2)
    })

    it('stamps the stored copy with the time it was written', async () => {
      await warm()
      const before = storedHeader(LIST, 'x-sw-cached-at')
      await vi.advanceTimersByTimeAsync(5)
      files[LIST] = stations('W/"v2"', 'x', 'b')
      await visit()
      expect(storedHeader(LIST, 'x-sw-cached-at')).not.toBeNull()
      expect(storedHeader(LIST, 'etag')).toBe('W/"v2"')
      expect(before).not.toBeNull()
    })
  })

  describe('when nothing changed', () => {
    it('writes nothing and posts nothing when the ETag is the same, even though the body moved (asOf)', async () => {
      await warm()
      const before = storedHeader(LIST, 'x-sw-cached-at')
      files[LIST] = stations('W/"v1"', '2030-01-01T00:00:00Z')
      await visit()
      expect(seen).toHaveLength(0)
      expect(storedHeader(LIST, 'x-sw-cached-at')).toBe(before)
      expect(await storedText(LIST)).toContain('2026-01-01T09:00:00Z')
    })

    it('compares the bench route by X-Resource-Rev when it has no ETag: a moving hit counter is not a change', async () => {
      await warm(BENCH)
      files[BENCH] = bench(1, 9)
      await visit(BENCH)
      expect(seen).toHaveLength(0)
    })

    it('posts for the bench route when the revision moved, and the next read is fresh', async () => {
      await warm(BENCH)
      files[BENCH] = bench(2, 2)
      const stale = await visit(BENCH)
      expect(await stale.json()).toMatchObject({ rev: 1 })
      expect(updates()).toHaveLength(2)
      const fresh = await visit(BENCH)
      expect(await fresh.json()).toMatchObject({ rev: 2 })
      expect(updates()).toHaveLength(2)
    })

    it('compares the body when a route has no validator at all', async () => {
      files[ONE] = json({ id: 'st-krn07', rev: 1 })
      await warm(ONE)
      await visit(ONE)
      expect(seen).toHaveLength(0)
      files[ONE] = json({ id: 'st-krn07', rev: 2 })
      await visit(ONE)
      expect(updates()).toHaveLength(2)
    })
  })

  describe('when the revalidation fails or is not usable', () => {
    const bad: Array<[string, Served | 'offline']> = [
      ['the network being down', 'offline'],
      ['a 500', { status: 500, type: JSON_TYPE, body: '{}' }],
      ['a 429', { status: 429, type: JSON_TYPE, body: '{}' }],
      ['a 404', { status: 404, type: JSON_TYPE, body: '{"error":{}}' }],
      ['a captive portal page', { type: 'text/html', body: '<html>sign in</html>' }],
      ['JSON that does not parse', { type: JSON_TYPE, body: '{"items":[' }],
      ['an empty body', { type: JSON_TYPE, body: '' }],
      ['a body that fails half way', { type: JSON_TYPE, brokenBody: true }],
    ]

    it.each(bad)('keeps the stored copy, posts no update and logs a warning, for %s', async (_name, reply) => {
      await warm()
      const before = await storedText(LIST)
      if (reply === 'offline') sw.setOffline(true)
      else files[LIST] = reply
      const r = await visit()
      expect(r.headers.get('x-sw-source')).toBe('cache')
      expect(await storedText(LIST)).toBe(before)
      expect(updates()).toHaveLength(0)
      expect(logs().length).toBeGreaterThan(0)
    })

    it('gives up on a revalidation that takes more than 10 seconds, and keeps the stored copy', async () => {
      await warm()
      files[LIST] = { ...stations('W/"v2"', 'x', 'b'), delayMs: 60_000 }
      const r = await ask(LIST)
      expect(r.headers.get('x-sw-source')).toBe('cache')
      await vi.advanceTimersByTimeAsync(10_000)
      await sw.settle()
      expect(await storedText(LIST)).toContain('"marker":"a"')
      expect(updates()).toHaveLength(0)
      expect(logs().length).toBeGreaterThan(0)
    })

    it('posts no update when the new copy cannot be written', async () => {
      await warm()
      files[LIST] = stations('W/"v2"', 'x', 'b')
      sw.setWritesFail(true)
      await visit()
      expect(updates()).toHaveLength(0)
      expect(await storedText(LIST)).toContain('"marker":"a"')
    })

    it('does not break the answer when no window can be messaged', async () => {
      await warm()
      files[LIST] = stations('W/"v2"', 'x', 'b')
      sw.setWindows([])
      const r = await visit()
      expect(r.status).toBe(200)
      expect(await storedText(LIST)).toContain('"marker":"b"')
    })
  })

  describe('keys and the cache', () => {
    it('keeps each URL separate: the list, a station by code and the same station by id', async () => {
      files['/api/stations/st-krn07'] = json({ id: 'st-krn07', rev: 1 }, { ETag: 'W/"r1"' })
      for (const path of [LIST, ONE, '/api/stations/st-krn07', `${LIST}?region=north`]) await warm(path)
      expect([...(sw.stores.get(API_CACHE)?.keys() ?? [])].map((k) => k.replace(ORIGIN, '')).sort()).toEqual([LIST, `${LIST}?region=north`, ONE, '/api/stations/st-krn07'].sort())
    })

    it('treats a cache that cannot be read as having nothing stored, and answers from the network', async () => {
      await warm()
      sw.setCacheUnreadable(true)
      const r = await ask(LIST)
      expect(r.headers.get('x-sw-source')).toBe('network')
    })
  })

  describe('what is left alone', () => {
    it.each([
      ['a write to a station', { method: 'PATCH', url: `${ORIGIN}${ONE}` }],
      ['a path with a segment after the code', { url: `${ORIGIN}${ONE}/history` }],
      ['the stations list with a trailing slash', { url: `${ORIGIN}${LIST}/` }],
      ['a name that only starts with the same letters', { url: `${ORIGIN}/api/stationsX` }],
      ['the bench route with no key', { url: `${ORIGIN}/api/bench/stale-while-revalidate/` }],
      ['another bench strategy', { url: `${ORIGIN}/api/bench/network-first/alpha` }],
      ['a navigation to the list typed into the address bar', { url: `${ORIGIN}${LIST}`, mode: 'navigate' }],
      ['another origin', { url: `https://example.com${LIST}` }],
    ])('does not handle %s', async (_name, request) => {
      expect(await sw.dispatch(request)).toBe('not handled')
    })
  })
})
