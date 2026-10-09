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
const URLS = ['/assets/index-AAA.js', '/assets/index-BBB.css', '/assets/font-CCC.woff2']

interface Served {
  status?: number
  type?: string
  body?: string
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

  const absolute = (input: string): string => new URL(input, ORIGIN).href
  const urlOf = (input: string | { url: string }): string => (typeof input === 'string' ? absolute(input) : input.url)

  const fakeFetch = async (input: { url: string; cache?: string; headers?: Headers }): Promise<Response> => {
    const url = new URL(input.url)
    requested.push({ url: url.pathname, cache: input.cache ?? 'default', accept: input.headers?.get('accept') ?? null })
    if (offline) throw new TypeError('Failed to fetch')
    const entry = served[url.pathname]
    if (!entry) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    return new Response(entry.body ?? 'x', { status: entry.status ?? 200, headers: { 'content-type': entry.type ?? 'text/javascript' } })
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
      return { put: async (key: string | { url: string }, response: Response) => void store.set(urlOf(key), response) }
    },
    async match(key: string | { url: string }, options?: { cacheName?: string }) {
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
    URL,
    Set,
    Promise,
    Error,
    TypeError,
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
  const dispatch = async (request: { method?: string; url: string; mode?: string }): Promise<Response | 'not handled'> => {
    let answer: Promise<Response> | undefined
    handler('fetch')({ request: { method: 'GET', mode: 'cors', ...request }, respondWith: (p: Promise<Response>) => void (answer = p) })
    return answer ? answer : 'not handled'
  }

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
    fakeFetch,
    activate: (): Promise<unknown> => {
      let work: Promise<unknown> = Promise.resolve()
      handler('activate')({ waitUntil: (p: Promise<unknown>) => void (work = p) })
      return work
    },
  }
}

const HEALTHY: Record<string, Served> = {
  '/index.html': { type: 'text/html; charset=utf-8', body: '<html>shell</html>' },
  '/assets/index-AAA.js': { body: 'console.log(1)' },
  '/assets/index-BBB.css': { type: 'text/css', body: 'body{}' },
  '/assets/font-CCC.woff2': { type: 'font/woff2', body: 'font' },
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
    expect(sw.requested).toHaveLength(1 + URLS.length)
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
  ])('fails the whole install on %s, stores nothing and does not skip waiting', async (_name, served, reason) => {
    const sw = setup(served)
    await expect(sw.install()).rejects.toThrow(reason)
    const stored = sw.stores.get(SHELL_CACHE)
    expect(stored?.size ?? 0).toBe(0)
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

  it('goes to the network for a hashed file it did not precache: a lazy route chunk', async () => {
    const answer = await sw.dispatch({ url: `${ORIGIN}/assets/LogPage-ZZZ.js` })
    expect(answer).toBe('not handled')
  })

  it('does not handle API calls, media, version files or the worker script', async () => {
    for (const path of ['/api/dispatches', '/api/signal', '/api/_lab/state', '/media/dispatch/dp-000001.svg', '/version.json', '/favicon.svg', '/icons/icon-192.png', '/sw.js']) {
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
    expect(postMessage).toHaveBeenCalledWith({ type: 'sw-version', version: 'build-test', caches: [SHELL_CACHE] })
  })

  it('ignores every other message', async () => {
    const sw = setup(HEALTHY)
    const postMessage = vi.fn()
    sw.handler('message')({ data: { type: 'ping', nonce: 'x' }, source: { postMessage }, waitUntil: () => undefined })
    sw.handler('message')({ data: null, source: { postMessage }, waitUntil: () => undefined })
    expect(postMessage).not.toHaveBeenCalled()
  })
})
