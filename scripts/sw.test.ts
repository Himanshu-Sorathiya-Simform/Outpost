import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  /** The server takes this long to answer (a fake-timer duration), as under Lie-fi. */
  delayMs?: number
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
  /** The open windows the worker can message. Each records what it was sent. */
  let windows: Array<{ postMessage: (message: unknown) => void }> = [{ postMessage: (message) => void posted.push(message) }]
  const waited: Array<Promise<unknown>> = []
  const warnings: unknown[][] = []

  const absolute = (input: string): string => new URL(input, ORIGIN).href
  const urlOf = (input: string | { url: string }): string => (typeof input === 'string' ? absolute(input) : input.url)

  const fakeFetch = async (input: { url: string; cache?: string; headers?: Headers; signal?: AbortSignal }): Promise<Response> => {
    const url = new URL(input.url)
    requested.push({ url: url.pathname, cache: input.cache ?? 'default', accept: input.headers?.get('accept') ?? null })
    if (offline) throw new TypeError('Failed to fetch')
    const entry = served[url.pathname]
    if (entry?.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, entry.delayMs)
        input.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      })
    }
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
      clients: { claim, matchAll: async () => windows },
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
    AbortController,
    // Looked up at call time, so a test that installs fake timers controls them.
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
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
    setWindows: (list: Array<{ postMessage: (message: unknown) => void }>) => void (windows = list),
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
    for (const path of ['/api/signal', '/api/_lab/state', '/version.json', '/favicon.svg', '/icons/icon-192.png', '/sw.js']) {
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
    for (const path of ['/api/handbook-archive', '/api/handbooks', '/api/handbookx/alpha', '/api/bench/network-only/alpha']) {
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
    for (const path of ['/api/signal', '/api/inbox/read-all', '/api/session', '/api/ping', '/api/version', '/api/_lab/state', '/api/_lab/events']) {
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
      ['the other bench strategies', { url: `${ORIGIN}/api/bench/network-only/alpha` }],
      ['a navigation to the list typed into the address bar', { url: `${ORIGIN}${LIST}`, mode: 'navigate' }],
      ['another origin', { url: `https://example.com${LIST}` }],
    ])('does not handle %s', async (_name, request) => {
      expect(await sw.dispatch(request)).toBe('not handled')
    })
  })
})
