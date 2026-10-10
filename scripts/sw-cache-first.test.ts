import { beforeEach, describe, expect, it } from 'vitest'
import { ORIGIN, SHELL_CACHE, MEDIA_CACHE, ASSETS_CACHE, API_CACHE, Served, setup, JSON_TYPE, SERVED_AT, json, HEALTHY } from './sw-harness'

describe('cache-first routes', () => {
  const SVG = 'image/svg+xml; charset=utf-8'
  const PLATE = '/media/dispatch/dp-000001.svg'
  const CHUNK = '/assets/LogPage-ZZZ.js'
  const BENCH = '/api/bench/cache-first/alpha'
  const benchBody = (rev: number) => json({ strategy: 'cache-first', key: 'alpha', rev, hits: rev, payload: { label: 'alpha', sample: rev } }, { 'X-Served-At': SERVED_AT })

  const served = (): Record<string, Served> => ({
    ...HEALTHY,
    [PLATE]: { type: SVG, body: '<svg>plate</svg>' },
    [CHUNK]: { body: 'console.log("log page")' },
    [BENCH]: benchBody(1),
  })

  let files: Record<string, Served>
  let sw: ReturnType<typeof setup>
  beforeEach(async () => {
    files = served()
    sw = setup(files)
    await sw.install()
    sw.requested.length = 0
  })

  const answer = async (path: string, init: { headers?: Headers } = {}): Promise<Response> => {
    const r = await sw.dispatch({ url: `${ORIGIN}${path}`, ...init })
    if (r === 'not handled') throw new Error(`${path} was not handled`)
    return r
  }
  const storedKeys = (name: string): string[] => [...(sw.stores.get(name)?.keys() ?? [])].map((k) => k.replace(ORIGIN, ''))

  describe('a stored file', () => {
    it('is answered from the cache it was stored in, labelled, without touching the network: a shell file from shell-v1', async () => {
      const r = await answer('/assets/index-AAA.js')
      expect(await r.text()).toBe('console.log(1)')
      expect(r.headers.get('x-sw-source')).toBe('cache')
      expect(r.headers.get('x-sw-strategy')).toBe('cache-first')
      expect(r.headers.get('x-sw-cache')).toBe(SHELL_CACHE)
      expect(sw.requested).toHaveLength(0)
    })

    it('is the same for a plate and the bench entry, and each names its own cache', async () => {
      await answer(PLATE)
      await answer(BENCH)
      await sw.settle()
      sw.requested.length = 0
      const plate = await answer(PLATE)
      const bench = await answer(BENCH)
      expect(plate.headers.get('x-sw-cache')).toBe(MEDIA_CACHE)
      expect(bench.headers.get('x-sw-cache')).toBe(API_CACHE)
      expect(await plate.text()).toBe('<svg>plate</svg>')
      expect(sw.requested).toHaveLength(0)
    })
  })

  describe('a file that is not stored yet', () => {
    it('goes to the network once, is answered labelled as a network answer, and is stored under its own URL', async () => {
      const r = await answer(PLATE)
      expect(r.status).toBe(200)
      expect(r.headers.get('x-sw-source')).toBe('network')
      expect(r.headers.get('x-sw-strategy')).toBe('cache-first')
      expect(await r.text()).toBe('<svg>plate</svg>')
      await sw.settle()
      expect(storedKeys(MEDIA_CACHE)).toEqual([PLATE])
      expect(sw.requested.map((q) => q.url)).toEqual([PLATE])
    })

    it('is stored with the time it was stored, and keeps the headers the server sent', async () => {
      await answer(BENCH)
      await sw.settle()
      const stored = sw.stores.get(API_CACHE)?.get(`${ORIGIN}${BENCH}`)
      expect(stored?.headers.get('x-served-at')).toBe(SERVED_AT)
      expect(Number.isNaN(Date.parse(stored?.headers.get('x-sw-cached-at') ?? ''))).toBe(false)
    })

    it('is stored from a clone: the answer and the stored copy both have the whole body', async () => {
      const r = await answer(CHUNK)
      expect(await r.text()).toBe('console.log("log page")')
      await sw.settle()
      expect(await sw.stores.get(ASSETS_CACHE)?.get(`${ORIGIN}${CHUNK}`)?.text()).toBe('console.log("log page")')
    })

    it('then comes from the cache the next time, even with the network down: a visited route works offline', async () => {
      await answer(CHUNK)
      await sw.settle()
      sw.setOffline(true)
      sw.requested.length = 0
      const r = await answer(CHUNK)
      expect(r.headers.get('x-sw-source')).toBe('cache')
      expect(r.headers.get('x-sw-cache')).toBe(ASSETS_CACHE)
      expect(await r.text()).toBe('console.log("log page")')
    })

    it('fails like a plain request when the network is down: no made-up answer', async () => {
      sw.setOffline(true)
      await expect(answer(PLATE)).rejects.toBeInstanceOf(TypeError)
      await expect(answer(CHUNK)).rejects.toBeInstanceOf(TypeError)
      expect(sw.stores.has(MEDIA_CACHE)).toBe(false)
    })

    it('keeps the query string as part of the URL, so a different query is a different entry', async () => {
      await answer(PLATE)
      await answer(`${PLATE}?v=2`)
      await sw.settle()
      expect(storedKeys(MEDIA_CACHE)).toEqual([PLATE, `${PLATE}?v=2`])
    })

    it('treats a cache that cannot be read as a miss and still answers from the network', async () => {
      sw.setCacheUnreadable(true)
      const r = await answer(PLATE)
      expect(r.headers.get('x-sw-source')).toBe('network')
      expect(await r.text()).toBe('<svg>plate</svg>')
    })
  })

  describe('the price of never asking', () => {
    it('keeps answering with the first revision after the server moves on, until the entry is removed', async () => {
      await answer(BENCH)
      await sw.settle()
      files[BENCH] = benchBody(2)
      const again = await answer(BENCH)
      expect(await again.json()).toMatchObject({ rev: 1 })
      expect(again.headers.get('x-sw-source')).toBe('cache')
      expect(sw.requested.filter((q) => q.url === BENCH)).toHaveLength(1)
    })
  })

  describe('an answer that is not what the URL should be', () => {
    const wrong: Array<[string, string, Served]> = [
      ['a plate the server answers 404', PLATE, { status: 404, type: JSON_TYPE, body: '{"error":{}}' }],
      ['a plate answered 500', PLATE, { status: 500, type: JSON_TYPE, body: '{"error":{}}' }],
      ['a plate answered as a captive portal page', PLATE, { type: 'text/html', body: '<html>sign in</html>' }],
      ['a plate answered as JSON', PLATE, { type: JSON_TYPE, body: '{}' }],
      ['a plate with an empty body', PLATE, { type: SVG, body: '', headers: { 'content-length': '0' } }],
      ['a chunk the server answers 404 (the stale chunks preset)', CHUNK, { status: 404, type: 'text/plain', body: 'gone' }],
      ['a chunk answered as a captive portal page', CHUNK, { type: 'text/html', body: '<html>sign in</html>' }],
      ['a chunk answered as an empty 200 with a JSON type', CHUNK, { type: JSON_TYPE, body: '', headers: { 'content-length': '0' } }],
      ['a chunk answered as an error JSON', CHUNK, { status: 500, type: JSON_TYPE, body: '{}' }],
      ['a bench entry that is rate limited', BENCH, { status: 429, type: JSON_TYPE, body: '{}' }],
      ['a bench entry that is a captive portal page', BENCH, { type: 'text/html', body: '<html>sign in</html>' }],
      ['a bench entry with broken JSON', BENCH, { type: JSON_TYPE, body: '{"strategy":' }],
      ['a bench entry with an empty body', BENCH, { type: JSON_TYPE, body: '' }],
      ['a bench entry of another strategy', BENCH, json({ strategy: 'network-first', key: 'alpha' })],
      ['a bench entry for another key', BENCH, json({ strategy: 'cache-first', key: 'beta' })],
    ]

    it.each(wrong)('passes %s to the page as it came and stores nothing', async (_name, path, reply) => {
      files[path] = reply
      const r = await answer(path)
      expect(r.status).toBe(reply.status ?? 200)
      expect(r.headers.get('x-sw-source')).toBe('network')
      await sw.settle()
      expect(sw.stores.has(MEDIA_CACHE)).toBe(false)
      expect(sw.stores.has(ASSETS_CACHE)).toBe(false)
      expect(sw.stores.has(API_CACHE)).toBe(false)
    })

    it('asks the network again next time, so the fix is seen as soon as the server is right', async () => {
      files[PLATE] = { status: 500, type: JSON_TYPE, body: '{}' }
      await answer(PLATE)
      files[PLATE] = { type: SVG, body: '<svg>plate</svg>' }
      const r = await answer(PLATE)
      expect(r.status).toBe(200)
      expect(await r.text()).toBe('<svg>plate</svg>')
      await sw.settle()
      expect(storedKeys(MEDIA_CACHE)).toEqual([PLATE])
    })

    it('stores nothing when the body fails half way, and the failure is logged and not thrown', async () => {
      files[CHUNK] = { brokenBody: true }
      const r = await answer(CHUNK)
      expect(r.status).toBe(200)
      await sw.settle()
      expect(sw.stores.get(ASSETS_CACHE)?.size ?? 0).toBe(0)
      expect(sw.warnings).toHaveLength(1)
    })
  })

  describe('a cache that cannot be written', () => {
    it('still gives the page its answer and logs a warning', async () => {
      sw.setWritesFail(true)
      const r = await answer(PLATE)
      expect(await r.text()).toBe('<svg>plate</svg>')
      await sw.settle()
      expect(sw.warnings).toHaveLength(1)
      expect(String(sw.warnings[0]?.[0])).toContain(PLATE)
    })
  })

  describe('the media cap', () => {
    const plate = (n: number): string => `/media/dispatch/dp-${String(n).padStart(6, '0')}.svg`

    it('keeps the newest 30 and removes the oldest first', async () => {
      for (let n = 1; n <= 35; n += 1) {
        files[plate(n)] = { type: SVG, body: `<svg>${n}</svg>` }
        await answer(plate(n))
        await sw.settle()
      }
      const keys = storedKeys(MEDIA_CACHE)
      expect(keys).toHaveLength(30)
      expect(keys[0]).toBe(plate(6))
      expect(keys.at(-1)).toBe(plate(35))
      expect(keys).not.toContain(plate(5))
    })

    it('does not cap the other caches', async () => {
      for (let n = 1; n <= 35; n += 1) {
        files[`/assets/Chunk${n}-AAA.js`] = { body: String(n) }
        await answer(`/assets/Chunk${n}-AAA.js`)
        await sw.settle()
      }
      expect(storedKeys(ASSETS_CACHE)).toHaveLength(35)
    })

    it('does not count a refused answer towards the cap', async () => {
      files[plate(1)] = { status: 404, type: JSON_TYPE, body: '{}' }
      await answer(plate(1))
      await sw.settle()
      expect(sw.stores.get(MEDIA_CACHE)?.size ?? 0).toBe(0)
    })
  })

  describe('what is left alone', () => {
    it.each([
      ['a write', { method: 'POST', url: `${ORIGIN}${BENCH}` }],
      ['a bump of the bench entry', { method: 'POST', url: `${ORIGIN}${BENCH}/bump` }],
      ['a navigation to a plate typed into the address bar', { url: `${ORIGIN}${PLATE}`, mode: 'navigate' }],
      ['a range request for part of a file', { url: `${ORIGIN}${PLATE}`, headers: new Headers({ Range: 'bytes=0-99' }) }],
      ['a path deeper than one bench key', { url: `${ORIGIN}${BENCH}/extra` }],
      ['the bench route with no key', { url: `${ORIGIN}/api/bench/cache-first/` }],
      ['a name that only starts with the same letters', { url: `${ORIGIN}/mediaX/a.svg` }],
      ['another origin', { url: `https://example.com${PLATE}` }],
      ['the unhashed files', { url: `${ORIGIN}/favicon.svg` }],
      ['the icons', { url: `${ORIGIN}/icons/icon-192.png` }],
      ['the version file', { url: `${ORIGIN}/version.json` }],
      ['the worker script', { url: `${ORIGIN}/sw.js` }],
    ])('does not handle %s', async (_name, request) => {
      expect(await sw.dispatch(request)).toBe('not handled')
    })
  })
})
