import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORIGIN, API_CACHE, Served, setup, JSON_TYPE, json, HEALTHY } from './sw-harness'

describe('network-first routes', () => {
  const LIST = '/api/dispatches'
  const ONE = '/api/dispatches/dp-000064'
  const INBOX = '/api/inbox/summary'
  const DIGEST = '/api/digest'
  const STAMPED_AT = '2026-01-01T08:00:00.000Z'
  const listBody = (marker: string) => json({ items: [{ id: 'dp-000064', marker }], nextCursor: null, total: 1, feedRev: 1 }, { 'X-Served-At': STAMPED_AT, ETag: 'W/"a"' })

  let files: Record<string, Served>
  let sw: ReturnType<typeof setup>

  beforeEach(async () => {
    files = { ...HEALTHY, [LIST]: listBody('first'), [ONE]: json({ id: 'dp-000064', rev: 1 }), [INBOX]: json({ unread: 3 }), [DIGEST]: json({ newCount: 1, items: [] }) }
    sw = setup(files)
    await sw.install()
    sw.requested.length = 0
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => vi.useRealTimers())

  const ask = async (path: string): Promise<Response> => {
    const r = await sw.dispatch({ url: `${ORIGIN}${path}` })
    if (r === 'not handled') throw new Error(`${path} was not handled`)
    return r
  }
  const storedKeys = (): string[] => [...(sw.stores.get(API_CACHE)?.keys() ?? [])].map((k) => k.replace(ORIGIN, ''))
  const storedText = async (path: string): Promise<string> => (await sw.stores.get(API_CACHE)?.get(`${ORIGIN}${path}`)?.clone().text()) ?? ''
  /** Warms the stored copy while the network is good, then tidies up so a test starts from "one stored copy". */
  const warm = async (path = LIST): Promise<void> => {
    await (await ask(path)).text()
    await sw.settle()
    sw.requested.length = 0
  }

  describe('a good answer in time', () => {
    it.each([LIST, ONE, INBOX, DIGEST])('is answered from the network, stored, and labelled, for %s', async (path) => {
      const r = await ask(path)
      expect(r.status).toBe(200)
      expect(r.headers.get('x-sw-source')).toBe('network')
      expect(r.headers.get('x-sw-strategy')).toBe('network-first')
      expect(r.headers.get('x-sw-cache')).toBe(API_CACHE)
      expect(r.headers.get('x-sw-fallback-reason')).toBeNull()
      await sw.settle()
      expect(storedKeys()).toEqual([path])
    })

    it('stores a copy with the time it was stored and keeps the server X-Served-At, and the page still gets the whole body', async () => {
      const r = await ask(LIST)
      expect(await r.json()).toMatchObject({ items: [{ marker: 'first' }] })
      await sw.settle()
      const stored = sw.stores.get(API_CACHE)?.get(`${ORIGIN}${LIST}`)
      expect(stored?.headers.get('x-served-at')).toBe(STAMPED_AT)
      expect(Number.isNaN(Date.parse(stored?.headers.get('x-sw-cached-at') ?? ''))).toBe(false)
      expect(await stored?.json()).toMatchObject({ items: [{ marker: 'first' }] })
    })

    it('always asks the network first, and the stored copy moves to what it said', async () => {
      await warm()
      files[LIST] = listBody('second')
      const r = await ask(LIST)
      expect(await r.text()).toContain('second')
      expect(sw.requested.map((q) => q.url)).toEqual([LIST])
      await sw.settle()
      expect(await storedText(LIST)).toContain('second')
    })
  })

  describe('the network fails or is down', () => {
    it('answers with the stored copy, labelled as a fallback with its true age, and the reason', async () => {
      await warm()
      sw.setOffline(true)
      const r = await ask(LIST)
      expect(r.status).toBe(200)
      expect(await r.text()).toContain('first')
      expect(r.headers.get('x-sw-source')).toBe('fallback')
      expect(r.headers.get('x-sw-strategy')).toBe('network-first')
      expect(r.headers.get('x-sw-cache')).toBe(API_CACHE)
      expect(r.headers.get('x-sw-fallback-reason')).toBe('network')
      expect(r.headers.get('x-served-at')).toBe(STAMPED_AT)
      expect(Number.isNaN(Date.parse(r.headers.get('x-sw-cached-at') ?? ''))).toBe(false)
    })

    it('fails like a plain request when nothing is stored for that URL', async () => {
      sw.setOffline(true)
      await expect(ask(LIST)).rejects.toBeInstanceOf(TypeError)
      expect(sw.stores.has(API_CACHE)).toBe(false)
    })

    it('does not use the copy of another URL: a different filter has its own entry', async () => {
      await warm(LIST)
      await warm(`${LIST}?severity=urgent`)
      sw.setOffline(true)
      await expect(ask(`${LIST}?severity=routine`)).rejects.toBeInstanceOf(TypeError)
      expect(storedKeys().sort()).toEqual([LIST, `${LIST}?severity=urgent`])
    })

    it('treats a cache that cannot be read as having nothing stored', async () => {
      await warm()
      sw.setOffline(true)
      sw.setCacheUnreadable(true)
      await expect(ask(LIST)).rejects.toBeInstanceOf(TypeError)
    })
  })

  describe('the network is too slow', () => {
    it('answers with the stored copy after 3 seconds, and the slow request still refreshes the stored copy when it lands', async () => {
      await warm()
      files[LIST] = { ...listBody('late'), delayMs: 6000 }
      const pending = ask(LIST)
      await vi.advanceTimersByTimeAsync(2999)
      let settled = false
      void pending.then(() => (settled = true))
      await vi.advanceTimersByTimeAsync(0)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      const r = await pending
      expect(await r.text()).toContain('first')
      expect(r.headers.get('x-sw-source')).toBe('fallback')
      expect(r.headers.get('x-sw-fallback-reason')).toBe('timeout')
      await vi.advanceTimersByTimeAsync(3000)
      await sw.settle()
      expect(await storedText(LIST)).toContain('late')
    })

    it('answers at once, not after 3 seconds, when the network answers in time', async () => {
      await warm()
      files[LIST] = { ...listBody('quick'), delayMs: 1000 }
      const pending = ask(LIST)
      await vi.advanceTimersByTimeAsync(1000)
      expect(await (await pending).text()).toContain('quick')
    })

    it('keeps waiting when nothing is stored, and answers with what the network gives, however late', async () => {
      files[LIST] = { ...listBody('slow'), delayMs: 7000 }
      const pending = ask(LIST)
      await vi.advanceTimersByTimeAsync(7000)
      const r = await pending
      expect(await r.text()).toContain('slow')
      expect(r.headers.get('x-sw-source')).toBe('network')
      await sw.settle()
      expect(storedKeys()).toEqual([LIST])
    })

    it('hands over the real answer when a slow request with nothing stored ends badly', async () => {
      files[LIST] = { status: 500, type: JSON_TYPE, body: '{"error":{"code":"internal"}}', delayMs: 5000 }
      const pending = ask(LIST)
      await vi.advanceTimersByTimeAsync(5000)
      const r = await pending
      expect(r.status).toBe(500)
      expect(r.headers.get('x-sw-source')).toBe('network')
      expect(sw.stores.has(API_CACHE)).toBe(false)
    })

    it('does not store a slow answer that turns out to be bad, and the stored copy stays', async () => {
      await warm()
      files[LIST] = { status: 503, type: JSON_TYPE, body: '{}', delayMs: 5000 }
      const pending = ask(LIST)
      await vi.advanceTimersByTimeAsync(5000)
      await pending
      await sw.settle()
      expect(await storedText(LIST)).toContain('first')
    })
  })

  describe('an answer that is not usable', () => {
    const bad: Array<[string, Served, string]> = [
      ['a 500', { status: 500, type: JSON_TYPE, body: '{"error":{}}' }, 'status-500'],
      ['a 503', { status: 503, type: JSON_TYPE, body: '{"error":{}}' }, 'status-503'],
      ['a 429', { status: 429, type: JSON_TYPE, body: '{"error":{}}' }, 'status-429'],
      ['a captive portal page with status 200', { type: 'text/html', body: '<html>sign in</html>' }, 'content-type'],
      ['JSON that does not parse', { type: JSON_TYPE, body: '{"items":[' }, 'body'],
      ['an empty body', { type: JSON_TYPE, body: '' }, 'body'],
      ['a body that fails half way', { type: JSON_TYPE, brokenBody: true }, 'body'],
    ]

    it.each(bad)('with %s the stored copy is answered and is not overwritten', async (_name, reply, reason) => {
      await warm()
      files[LIST] = reply
      const r = await ask(LIST)
      expect(r.status).toBe(200)
      expect(await r.text()).toContain('first')
      expect(r.headers.get('x-sw-source')).toBe('fallback')
      expect(r.headers.get('x-sw-fallback-reason')).toBe(reason)
      await sw.settle()
      expect(await storedText(LIST)).toContain('first')
    })

    it.each(bad.slice(0, 5))('with %s and nothing stored the page gets the real answer, and nothing is stored', async (_name, reply) => {
      files[LIST] = reply
      const r = await ask(LIST)
      expect(r.status).toBe(reply.status ?? 200)
      expect(r.headers.get('x-sw-source')).toBe('network')
      await sw.settle()
      expect(sw.stores.has(API_CACHE)).toBe(false)
    })
  })

  describe('an answer that is real, even though it is not a 200', () => {
    it.each([
      ['a 401 (the session ended)', 401],
      ['a 403', 403],
      ['a 404 (the dispatch is gone)', 404],
    ])('lets %s through and keeps the stored copy for later', async (_name, status) => {
      await warm(ONE)
      files[ONE] = { status, type: JSON_TYPE, body: '{"error":{}}' }
      const r = await ask(ONE)
      expect(r.status).toBe(status)
      expect(r.headers.get('x-sw-source')).toBe('network')
      await sw.settle()
      expect(await storedText(ONE)).toContain('dp-000064')
    })
  })

  describe('keys and the cap', () => {
    it('keys each URL by its exact path and query, so a cursor and a filter are separate entries', async () => {
      await warm(LIST)
      await warm(`${LIST}?cursor=abc`)
      await warm(`${LIST}?cursor=abc&severity=urgent`)
      expect(storedKeys().sort()).toEqual([LIST, `${LIST}?cursor=abc`, `${LIST}?cursor=abc&severity=urgent`].sort())
    })

    it('keeps the newest 80 entries of api-v1 and removes the oldest first', async () => {
      for (let n = 1; n <= 85; n += 1) await warm(`${DIGEST}?since=${n}`)
      const keys = storedKeys()
      expect(keys).toHaveLength(80)
      expect(keys[0]).toBe(`${DIGEST}?since=6`)
      expect(keys.at(-1)).toBe(`${DIGEST}?since=85`)
    })

    it('still gives the page its answer when the write fails, and logs a warning', async () => {
      sw.setWritesFail(true)
      const r = await ask(LIST)
      expect(await r.text()).toContain('first')
      await sw.settle()
      expect(sw.warnings).toHaveLength(1)
    })
  })

  describe('what is left alone', () => {
    it.each([
      ['a write to the list', { method: 'POST', url: `${ORIGIN}${LIST}` }],
      ['a patch of a dispatch', { method: 'PATCH', url: `${ORIGIN}${ONE}` }],
      ['a path with a segment after the id', { url: `${ORIGIN}${ONE}/extra` }],
      ['the list with a trailing slash', { url: `${ORIGIN}${LIST}/` }],
      ['the inbox write', { method: 'POST', url: `${ORIGIN}/api/inbox/read-all` }],
      ['a path no strategy owns', { url: `${ORIGIN}/api/handbook-archive` }],
      ['the signal board', { url: `${ORIGIN}/api/signal` }],
      ['the session', { url: `${ORIGIN}/api/session` }],
      ['a navigation to the list typed into the address bar', { url: `${ORIGIN}${LIST}`, mode: 'navigate' }],
      ['another origin', { url: `https://example.com${LIST}` }],
    ])('does not handle %s', async (_name, request) => {
      expect(await sw.dispatch(request)).toBe('not handled')
    })
  })
})
