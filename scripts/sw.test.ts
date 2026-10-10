import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { injectServiceWorker } from './sw-inject'

/**
 * Runs the real public/sw.js, with the two build tokens filled in, inside a sandbox that has a fake `self`, `caches` and `fetch`.
 * No browser is involved, so this checks the logic (what is fetched, what is stored, what is refused, who answers a request),
 * not the browser's lifecycle. Lab -> Worker and Lab -> Caches are the check for that.
 */

const ORIGIN = 'http://localhost:4000'
const SHELL_CACHE = 'shell-v1'
const PRECACHE_CACHE = 'precache-v1'
const MEDIA_CACHE = 'media-v1'
const ASSETS_CACHE = 'assets-v1'
const API_CACHE = 'api-v1'
const URLS = ['/assets/index-AAA.js', '/assets/index-BBB.css', '/assets/font-CCC.woff2']

interface Served {
  status?: number
  type?: string
  body?: string
  /** The headers arrive and the body then fails half way, as under a truncating chaos rule. */
  brokenBody?: boolean
  headers?: Record<string, string>
}

type Handler = (event: Record<string, unknown>) => void

function setup(served: Record<string, Served>, urls: readonly string[] = URLS) {
  const handlers = new Map<string, Handler>()
  const requested: Array<{ url: string; cache: string; accept: string | null }> = []
  const stores = new Map<string, Map<string, Response>>()
  const skipWaiting = vi.fn(() => Promise.resolve())
  const claim = vi.fn(() => Promise.resolve())
  const posted: unknown[] = []
  let offline = false
  let unreadable = false
  let writesFail = false
  const waited: Array<Promise<unknown>> = []
  const warnings: unknown[][] = []

  const absolute = (input: string): string => new URL(input, ORIGIN).href
  const urlOf = (input: string | { url: string }): string => (typeof input === 'string' ? absolute(input) : input.url)

  const fakeFetch = async (input: { url: string; cache?: string; headers?: Headers }): Promise<Response> => {
    const url = new URL(input.url)
    requested.push({ url: url.pathname, cache: input.cache ?? 'default', accept: input.headers?.get('accept') ?? null })
    if (offline) throw new TypeError('Failed to fetch')
    const entry = served[url.pathname]
    if (!entry) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    const body = entry.brokenBody
      ? new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"par'))
            controller.error(new TypeError('network error'))
          },
        })
      : (entry.body ?? 'x')
    return new Response(body, { status: entry.status ?? 200, headers: { 'content-type': entry.type ?? 'text/javascript', ...entry.headers } })
  }

  class SandboxRequest extends Request {
    constructor(input: string | Request, init?: RequestInit) {
      super(typeof input === 'string' ? absolute(input) : input, init)
    }
  }

  const fakeCaches = {
    async open(name: string) {
      const store = stores.get(name) ?? new Map<string, Response>()
      stores.set(name, store)
      return {
        put: async (key: string | { url: string }, response: Response) => {
          if (writesFail) throw new DOMException('The quota has been exceeded', 'QuotaExceededError')
          // A real cache reads the whole body when it stores, so a body that breaks half way makes put() reject.
          store.set(urlOf(key), new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers }))
        },
        keys: async () => [...store.keys()].map((url) => new Request(url)),
        delete: async (key: { url: string }) => store.delete(key.url),
      }
    },
    async match(key: string | { url: string }, options?: { cacheName?: string }) {
      if (unreadable) throw new DOMException('The cache cannot be read', 'SecurityError')
      const names = options?.cacheName ? [options.cacheName] : [...stores.keys()]
      for (const name of names) {
        const hit = stores.get(name)?.get(urlOf(key))
        if (hit) return hit.clone()
      }
      return undefined
    },
    async keys() {
      return [...stores.keys()]
    },
  }

  const sandbox = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, handler: Handler) => void handlers.set(type, handler),
      skipWaiting,
      clients: { claim },
    },
    caches: fakeCaches,
    fetch: fakeFetch,
    Request: SandboxRequest,
    Response,
    Headers,
    URL,
    Set,
    Promise,
    Error,
    TypeError,
    Math,
    JSON,
    console: { warn: (...args: unknown[]) => void warnings.push(args) },
  }
  const source = injectServiceWorker(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { buildId: 'build-test', urls })
  vm.runInNewContext(source, sandbox)

  const handler = (type: string): Handler => {
    const found = handlers.get(type)
    if (!found) throw new Error(`the worker registered no ${type} listener`)
    return found
  }

  /** Fires `install` and resolves with whatever the worker passed to waitUntil, so a rejection is the install failing. */
  const install = (): Promise<unknown> => {
    let work: Promise<unknown> = Promise.resolve()
    handler('install')({ waitUntil: (p: Promise<unknown>) => void (work = p) })
    return work
  }

  /** Fires `fetch`. Resolves with the Response the worker answered, or 'not handled' when it left the request to the browser. */
  const dispatch = async (request: { method?: string; url: string; mode?: string; headers?: Headers }): Promise<Response | 'not handled'> => {
    let answer: Promise<Response> | undefined
    handler('fetch')({
      request: { method: 'GET', mode: 'cors', headers: new Headers(), ...request },
      respondWith: (p: Promise<Response>) => void (answer = p),
      waitUntil: (p: Promise<unknown>) => void waited.push(p),
    })
    return answer ? answer : 'not handled'
  }

  /** Resolves when everything the worker handed to waitUntil has finished: the cache writes behind an answer. */
  const settle = async (): Promise<void> => void (await Promise.all(waited))

  return {
    install,
    dispatch,
    handler,
    handlers,
    requested,
    stores,
    skipWaiting,
    claim,
    posted,
    setOffline: (value: boolean) => void (offline = value),
    setCacheUnreadable: (value: boolean) => void (unreadable = value),
    setWritesFail: (value: boolean) => void (writesFail = value),
    settle,
    warnings,
    fakeFetch,
    activate: (): Promise<unknown> => {
      let work: Promise<unknown> = Promise.resolve()
      handler('activate')({ waitUntil: (p: Promise<unknown>) => void (work = p) })
      return work
    },
  }
}

const SLUGS = ['arrival-and-handover', 'power-and-fuel', 'loss-of-contact-procedures']
const BENCH_KEYS = ['alpha', 'beta', 'gamma', 'delta']
const JSON_TYPE = 'application/json; charset=utf-8'
const SERVED_AT = '2026-01-01T00:00:00.000Z'

const json = (body: unknown, headers?: Record<string, string>): Served => ({ type: JSON_TYPE, body: JSON.stringify(body), headers })

const chapterBody = (slug: string, edition: string) => ({ slug, number: 1, title: slug, summary: 'summary', readMinutes: 3, edition, blocks: [] })

/** The handbook and the bench as the server answers them. Each carries X-Served-At, the header that says how old the data is. */
function apiFixtures(edition = '1988.4'): Record<string, Served> {
  return {
    '/api/handbook': json({ edition, updatedAt: SERVED_AT, chapters: SLUGS.map((slug, i) => ({ slug, number: i + 1, title: slug, summary: 'summary', readMinutes: 3 })) }, { 'X-Served-At': SERVED_AT }),
    ...Object.fromEntries(SLUGS.map((slug) => [`/api/handbook/${slug}`, json(chapterBody(slug, edition), { 'X-Served-At': SERVED_AT })])),
    ...Object.fromEntries(BENCH_KEYS.map((key) => [`/api/bench/cache-only/${key}`, json({ strategy: 'cache-only', key, rev: 1, hits: 1, payload: { label: key, sample: 1 } }, { 'X-Served-At': SERVED_AT })])),
  }
}

const HEALTHY: Record<string, Served> = {
  '/index.html': { type: 'text/html; charset=utf-8', body: '<html>shell</html>' },
  '/assets/index-AAA.js': { body: 'console.log(1)' },
  '/assets/index-BBB.css': { type: 'text/css', body: 'body{}' },
  '/assets/font-CCC.woff2': { type: 'font/woff2', body: 'font' },
  ...apiFixtures(),
}

const text = async (r: Response | 'not handled'): Promise<string> => (r === 'not handled' ? 'not handled' : r.text())

describe('install', () => {
  it('stores the shell under three keys and every precached file under its own URL, in shell-v1', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    const store = sw.stores.get(SHELL_CACHE)
    expect([...(store?.keys() ?? [])].sort()).toEqual(
      [`${ORIGIN}/`, `${ORIGIN}/index.html`, `${ORIGIN}/offline`, ...URLS.map((u) => `${ORIGIN}${u}`)].sort(),
    )
    expect(await sw.stores.get(SHELL_CACHE)?.get(`${ORIGIN}/offline`)?.text()).toBe('<html>shell</html>')
  })

  it('fetches with the HTTP cache bypassed, and asks for HTML when it fetches the shell', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    expect(sw.requested.every((r) => r.cache === 'reload')).toBe(true)
    expect(sw.requested.find((r) => r.url === '/index.html')?.accept).toBe('text/html')
    expect(sw.requested).toHaveLength(1 + URLS.length + 1 + SLUGS.length + 3)
  })

  it('calls skipWaiting only after the precache succeeded', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    expect(sw.skipWaiting).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a file the server answers 404', { ...HEALTHY, '/assets/index-AAA.js': { status: 404, type: 'text/plain', body: 'no' } }, /404/],
    ['a script answered with an HTML page (a captive portal)', { ...HEALTHY, '/assets/index-AAA.js': { type: 'text/html', body: '<html>sign in</html>' } }, /content type/],
    ['a shell answered with something that is not HTML', { ...HEALTHY, '/index.html': { type: 'application/json', body: '{}' } }, /content type/],
    ['a server error', { ...HEALTHY, '/assets/font-CCC.woff2': { status: 503, type: 'application/json', body: '{}' } }, /503/],
  ])('fails the whole install on %s, opens no bucket and does not skip waiting', async (_name, served, reason) => {
    const sw = setup(served)
    await expect(sw.install()).rejects.toThrow(reason)
    expect(sw.stores.size).toBe(0)
    expect(sw.skipWaiting).not.toHaveBeenCalled()
  })

  it('fails when the network is down', async () => {
    const sw = setup(HEALTHY)
    sw.setOffline(true)
    await expect(sw.install()).rejects.toThrow('Failed to fetch')
    expect(sw.skipWaiting).not.toHaveBeenCalled()
  })

  it('still installs where the build step has not run and the list is empty: the shell only', async () => {
    const sw = setup(HEALTHY, [])
    await sw.install()
    expect(sw.stores.get(SHELL_CACHE)?.size).toBe(3)
  })
})

describe('activate', () => {
  it('claims the open pages', async () => {
    const sw = setup(HEALTHY)
    await sw.activate()
    expect(sw.claim).toHaveBeenCalledTimes(1)
  })
})

describe('fetch', () => {
  let sw: ReturnType<typeof setup>
  beforeEach(async () => {
    sw = setup(HEALTHY)
    await sw.install()
    sw.requested.length = 0
  })

  it('answers a precached file from the cache without touching the network', async () => {
    const answer = await sw.dispatch({ url: `${ORIGIN}/assets/index-AAA.js` })
    expect(await text(answer)).toBe('console.log(1)')
    expect(sw.requested).toHaveLength(0)
  })

  it('does not handle API calls, version files, icons or the worker script', async () => {
    for (const path of ['/api/dispatches', '/api/signal', '/api/_lab/state', '/version.json', '/favicon.svg', '/icons/icon-192.png', '/sw.js']) {
      expect(await sw.dispatch({ url: `${ORIGIN}${path}` })).toBe('not handled')
    }
  })

  it('does not handle writes, whatever the URL', async () => {
    expect(await sw.dispatch({ method: 'POST', url: `${ORIGIN}/assets/index-AAA.js` })).toBe('not handled')
    expect(await sw.dispatch({ method: 'PATCH', url: `${ORIGIN}/api/dispatches/dp-000001` })).toBe('not handled')
  })

  it('does not handle another origin', async () => {
    expect(await sw.dispatch({ url: 'https://example.com/assets/index-AAA.js' })).toBe('not handled')
  })

  it('answers a navigation from the network when it is up, so a deploy shows at once', async () => {
    const answer = await sw.dispatch({ url: `${ORIGIN}/log`, mode: 'navigate' })
    expect(sw.requested.map((r) => r.url)).toEqual(['/log'])
    expect(answer).not.toBe('not handled')
  })

  it('answers a navigation with the stored shell when the network fails', async () => {
    sw.setOffline(true)
    for (const path of ['/log', '/stations/KRN-07', '/lab/worker', '/handbook/power-and-fuel', '/offline', '/']) {
      expect(await text(await sw.dispatch({ url: `${ORIGIN}${path}`, mode: 'navigate' }))).toBe('<html>shell</html>')
    }
  })

  it('lets a navigation to an API, media or file URL fail like a plain page would', async () => {
    sw.setOffline(true)
    for (const path of ['/api/dispatches', '/media/dispatch/dp-000001.svg', '/readme.txt']) {
      expect(await sw.dispatch({ url: `${ORIGIN}${path}`, mode: 'navigate' })).toBe('not handled')
    }
  })

  it('fails a navigation when the network is down and there is no stored shell', async () => {
    const empty = setup(HEALTHY)
    empty.setOffline(true)
    await expect(empty.dispatch({ url: `${ORIGIN}/log`, mode: 'navigate' })).rejects.toBeInstanceOf(TypeError)
  })

  it('serves the stored copy of a precached file even when the network is down', async () => {
    sw.setOffline(true)
    expect(await text(await sw.dispatch({ url: `${ORIGIN}/assets/index-BBB.css` }))).toBe('body{}')
  })
})

describe('get-version message', () => {
  it('replies to the sender with the build id and the cache names', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    const postMessage = vi.fn()
    let work: Promise<unknown> = Promise.resolve()
    sw.handler('message')({ data: { type: 'get-version' }, source: { postMessage }, waitUntil: (p: Promise<unknown>) => void (work = p) })
    await work
    expect(postMessage).toHaveBeenCalledWith({ type: 'sw-version', version: 'build-test', caches: [SHELL_CACHE, PRECACHE_CACHE] })
  })

  it('ignores every other message', async () => {
    const sw = setup(HEALTHY)
    const postMessage = vi.fn()
    sw.handler('message')({ data: { type: 'ping', nonce: 'x' }, source: { postMessage }, waitUntil: () => undefined })
    sw.handler('message')({ data: null, source: { postMessage }, waitUntil: () => undefined })
    expect(postMessage).not.toHaveBeenCalled()
  })
})

describe('precaching the API data', () => {
  it('stores the handbook index, every chapter and alpha, beta and gamma in precache-v1, and not delta', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    const keys = [...(sw.stores.get(PRECACHE_CACHE)?.keys() ?? [])].sort()
    expect(keys).toEqual(
      [`${ORIGIN}/api/handbook`, ...SLUGS.map((s) => `${ORIGIN}/api/handbook/${s}`), ...['alpha', 'beta', 'gamma'].map((k) => `${ORIGIN}/api/bench/cache-only/${k}`)].sort(),
    )
    expect(keys.some((k) => k.endsWith('/delta'))).toBe(false)
  })

  it('keeps the shell bucket for the shell: no API URL lands in shell-v1', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    expect([...(sw.stores.get(SHELL_CACHE)?.keys() ?? [])].some((k) => k.includes('/api/'))).toBe(false)
  })

  it('asks for JSON and bypasses the HTTP cache for every API file', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    const api = sw.requested.filter((r) => r.url.startsWith('/api/'))
    expect(api).toHaveLength(1 + SLUGS.length + 3)
    expect(api.every((r) => r.cache === 'reload' && r.accept === 'application/json')).toBe(true)
  })

  it('adds X-SW-Cached-At when it stores, and keeps the server X-Served-At, so a stored copy shows its true age', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    const stored = sw.stores.get(PRECACHE_CACHE)?.get(`${ORIGIN}/api/handbook`)
    expect(stored?.headers.get('x-served-at')).toBe(SERVED_AT)
    const cachedAt = stored?.headers.get('x-sw-cached-at') ?? ''
    expect(Number.isNaN(Date.parse(cachedAt))).toBe(false)
    expect(cachedAt).not.toBe(SERVED_AT)
  })

  it('stores bodies that are still readable after the checks parsed them', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    const stored = await sw.stores.get(PRECACHE_CACHE)?.get(`${ORIGIN}/api/handbook/${SLUGS[1]}`)?.json()
    expect(stored).toMatchObject({ slug: SLUGS[1], edition: '1988.4' })
  })

  const bad = (patch: Record<string, Served>): Record<string, Served> => ({ ...HEALTHY, ...patch })
  it.each([
    ['the handbook index answering 404', bad({ '/api/handbook': { status: 404, type: JSON_TYPE, body: '{}' } }), /\/api\/handbook answered 404/],
    ['the handbook index being a captive portal page', bad({ '/api/handbook': { type: 'text/html', body: '<html>sign in</html>' } }), /content type/],
    ['the handbook index with a body that stops half way', bad({ '/api/handbook': { type: JSON_TYPE, body: '{"edition":' } }), /not valid JSON/],
    ['the handbook index with an empty body', bad({ '/api/handbook': { type: JSON_TYPE, body: '' } }), /not valid JSON/],
    ['a handbook index that is a list, not an object', bad({ '/api/handbook': { type: JSON_TYPE, body: '[1,2]' } }), /lists no chapters/],
    ['an index that lists no chapters', bad({ '/api/handbook': json({ edition: '1988.4', chapters: [] }) }), /lists no chapters/],
    ['an index that lists a slug that is not a plain slug', bad({ '/api/handbook': json({ edition: '1988.4', chapters: [{ slug: '../x?y' }] }) }), /unusable slug/],
    ['a chapter answering 500', bad({ [`/api/handbook/${SLUGS[1]}`]: { status: 500, type: JSON_TYPE, body: '{}' } }), /500/],
    ['a chapter from another edition than the index', bad({ [`/api/handbook/${SLUGS[0]}`]: json(chapterBody(SLUGS[0] ?? '', '1988.5')) }), /edition 1988\.5 but the index is edition 1988\.4/],
    ['a chapter that is a different chapter', bad({ [`/api/handbook/${SLUGS[0]}`]: json(chapterBody('power-and-fuel', '1988.4')) }), /is the chapter "power-and-fuel"/],
    ['a bench key that is the wrong entry', bad({ '/api/bench/cache-only/beta': json({ strategy: 'cache-first', key: 'beta' }) }), /not the cache-only entry for beta/],
    ['a bench key rate limited', bad({ '/api/bench/cache-only/gamma': { status: 429, type: JSON_TYPE, body: '{}' } }), /429/],
  ])('fails the whole install on %s, and writes nothing, not even to the shell', async (_name, served, reason) => {
    const sw = setup(served)
    await expect(sw.install()).rejects.toThrow(reason)
    expect(sw.stores.size).toBe(0)
    expect(sw.skipWaiting).not.toHaveBeenCalled()
  })

  /** The edition the worker answers /api/handbook with. */
  const editionOf = async (sw: ReturnType<typeof setup>): Promise<string | undefined> => {
    const r = await sw.dispatch({ url: `${ORIGIN}/api/handbook` })
    if (r === 'not handled') return undefined
    const body = (await r.json()) as { edition?: string }
    return body.edition
  }

  it('a new install picks up a new handbook edition, which is the only way the stored copy changes', async () => {
    const served = { ...HEALTHY }
    const first = setup(served)
    await first.install()
    expect(await editionOf(first)).toBe('1988.4')

    Object.assign(served, apiFixtures('1988.5'))
    // The worker that is running keeps answering with what it stored, whatever the server says now.
    expect(await editionOf(first)).toBe('1988.4')

    const second = setup(served)
    await second.install()
    expect(await editionOf(second)).toBe('1988.5')
  })
})

describe('cache-only routes', () => {
  let sw: ReturnType<typeof setup>
  beforeEach(async () => {
    sw = setup(HEALTHY)
    await sw.install()
    sw.requested.length = 0
  })

  const answer = async (path: string): Promise<Response> => {
    const r = await sw.dispatch({ url: `${ORIGIN}${path}` })
    if (r === 'not handled') throw new Error(`${path} was not handled`)
    return r
  }

  it.each(['/api/handbook', ...SLUGS.map((s) => `/api/handbook/${s}`), '/api/bench/cache-only/alpha', '/api/bench/cache-only/beta', '/api/bench/cache-only/gamma'])(
    'answers %s from the cache, labelled as a stored copy, without touching the network',
    async (path) => {
      const r = await answer(path)
      expect(r.status).toBe(200)
      expect(r.headers.get('x-sw-source')).toBe('cache')
      expect(r.headers.get('x-sw-strategy')).toBe('cache-only')
      expect(r.headers.get('x-sw-cache')).toBe(PRECACHE_CACHE)
      expect(r.headers.get('x-served-at')).toBe(SERVED_AT)
      expect(r.headers.get('x-sw-cached-at')).not.toBeNull()
      expect(r.headers.get('content-type')).toBe(JSON_TYPE)
      expect(await r.json()).toBeTypeOf('object')
      expect(sw.requested).toHaveLength(0)
    },
  )

  it('answers the same URL twice with a full body each time', async () => {
    const a = await (await answer('/api/handbook')).text()
    const b = await (await answer('/api/handbook')).text()
    expect(a.length).toBeGreaterThan(20)
    expect(b).toBe(a)
  })

  it('answers with the stored copy when the network is down', async () => {
    sw.setOffline(true)
    expect((await answer('/api/handbook/power-and-fuel')).status).toBe(200)
    expect(sw.requested).toHaveLength(0)
  })

  it('answers with what it stored, not what the server holds now', async () => {
    const stored = await (await answer('/api/bench/cache-only/alpha')).json()
    expect(stored).toMatchObject({ rev: 1 })
  })

  it('answers delta with a cache-miss even though the server is up and holds it: the route never goes to the network', async () => {
    const r = await answer('/api/bench/cache-only/delta')
    expect(r.status).toBe(504)
    expect(r.headers.get('x-sw-source')).toBe('cache-miss')
    expect(sw.requested).toHaveLength(0)
  })

  it('makes the miss in the server error shape the page decodes, with no header that says the server answered', async () => {
    const r = await answer('/api/bench/cache-only/delta')
    const body = (await r.json()) as { error: { code: string; message: string; requestId: string } }
    expect(body.error.code).toBe('unavailable')
    expect(body.error.message).toContain('/api/bench/cache-only/delta')
    expect(body.error.requestId).toMatch(/^sw-/)
    expect(r.headers.get('content-type')).toContain('application/json')
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(r.headers.get('x-served-by')).toBeNull()
    expect(r.headers.get('x-sw-strategy')).toBe('cache-only')
  })

  it.each([
    ['a chapter that was never stored', '/api/handbook/not-a-chapter'],
    ['the index with a query string, which is a different URL', '/api/handbook?x=1'],
    ['a chapter with a query string', `/api/handbook/${SLUGS[0]}?x=1`],
    ['the index with a trailing slash', '/api/handbook/'],
    ['a bench key nobody precached', '/api/bench/cache-only/omega'],
  ])('answers %s with a cache-miss, never with a near match', async (_name, path) => {
    const r = await answer(path)
    expect(r.status).toBe(504)
    expect(r.headers.get('x-sw-source')).toBe('cache-miss')
    expect(sw.requested).toHaveLength(0)
  })

  it('treats a cache that cannot be read as a miss, so the page shows the same screen', async () => {
    sw.setCacheUnreadable(true)
    const r = await answer('/api/handbook')
    expect(r.status).toBe(504)
    expect(r.headers.get('x-sw-source')).toBe('cache-miss')
  })

  it('does not handle names that only start with the same letters', async () => {
    for (const path of ['/api/handbook-archive', '/api/handbooks', '/api/handbookx/alpha', '/api/bench/network-only/alpha', '/api/bench/stale-while-revalidate/alpha']) {
      expect(await sw.dispatch({ url: `${ORIGIN}${path}` })).toBe('not handled')
    }
  })

  it('does not handle writes or other methods on these routes, so a bump still reaches the server', async () => {
    expect(await sw.dispatch({ method: 'POST', url: `${ORIGIN}/api/bench/cache-only/alpha/bump` })).toBe('not handled')
    expect(await sw.dispatch({ method: 'HEAD', url: `${ORIGIN}/api/handbook` })).toBe('not handled')
  })

  it('does not handle a navigation to a cache-only URL typed into the address bar', async () => {
    expect(await sw.dispatch({ url: `${ORIGIN}/api/handbook`, mode: 'navigate' })).toBe('not handled')
  })

  it('still leaves every other API route to the network', async () => {
    for (const path of ['/api/dispatches', '/api/stations', '/api/signal', '/api/inbox/summary', '/api/session', '/api/ping', '/api/version', '/api/_lab/state', '/api/_lab/events']) {
      expect(await sw.dispatch({ url: `${ORIGIN}${path}` })).toBe('not handled')
    }
  })
})

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
