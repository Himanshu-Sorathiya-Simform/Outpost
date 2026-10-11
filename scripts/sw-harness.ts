import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { IDBFactory, IDBDatabase } from 'fake-indexeddb'
import { vi } from 'vitest'
import { bundleWorker } from './sw-build'

/**
 * The shared harness of the worker tests. It bundles the real worker (src/sw/, through scripts/sw-build.ts, the same step the build
 * uses) and runs the finished script inside a sandbox that has a fake `self`, `caches` and `fetch`. No browser is involved, so this
 * checks the logic (what is fetched, what is stored, what is refused, who answers a request), not the browser's lifecycle.
 * Lab -> Worker and Lab -> Caches are the check for that. What is tested is the artifact that ships, not the modules one by one.
 */

export const ORIGIN = 'http://localhost:4000'
export const SHELL_CACHE = 'shell-v1'
export const PRECACHE_CACHE = 'precache-v1'
export const MEDIA_CACHE = 'media-v1'
export const ASSETS_CACHE = 'assets-v1'
export const API_CACHE = 'api-v1'
export const URLS = ['/assets/index-AAA.js', '/assets/index-BBB.css', '/assets/font-CCC.woff2']

// The worker, bundled once per file with the shell list a test asks for. `[]` is the dev case: the build step has not run.
const SOURCES = new Map<string, string>([
  [JSON.stringify(URLS), await bundleWorker({ buildId: 'build-test', urls: URLS })],
  [JSON.stringify([]), await bundleWorker({ buildId: 'build-test', urls: [] })],
])
const workerSource = (urls: readonly string[]): string => {
  const source = SOURCES.get(JSON.stringify(urls))
  if (!source) throw new Error(`The harness has no bundle for the shell list ${JSON.stringify(urls)}`)
  return source
}

// A second, tiny bundle that exposes two internals (the store guard) to a test, since nothing in the real worker reaches them with a
// never-cached URL by design. The entry is written to a temporary folder so no test-only file lives in the source tree.
const INTERNALS_SOURCE = await (async (): Promise<string> => {
  const folder = mkdtempSync(join(tmpdir(), 'outpost-sw-internals-'))
  try {
    const runtime = fileURLToPath(new URL('../src/sw/caching/runtime.ts', import.meta.url))
    const entry = join(folder, 'entry.ts')
    writeFileSync(entry, `import { isNeverCached, store } from ${JSON.stringify(runtime)}\n;(globalThis as Record<string, unknown>).__sw = { isNeverCached, store }\n`)
    return await bundleWorker({ buildId: 'build-test', urls: [], entry })
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})()

export interface Served {
  status?: number
  type?: string
  body?: string
  /** The headers arrive and the body then fails half way, as under a truncating chaos rule. */
  brokenBody?: boolean
  /** The server takes this long to answer (a fake-timer duration), as under Lie-fi. */
  delayMs?: number
  headers?: Record<string, string>
}

export type Handler = (event: Record<string, unknown>) => void

export function setup(served: Record<string, Served>, urls: readonly string[] = URLS, options: { internals?: boolean; connectionLimit?: number; badgeApi?: boolean } = {}) {
  const handlers = new Map<string, Handler>()
  const requested: Array<{ url: string; cache: string; accept: string | null }> = []
  /** The headers of every request the worker sent to the server, in order. */
  const forwarded: Headers[] = []
  const stores = new Map<string, Map<string, Response>>()
  const skipWaiting = vi.fn(() => Promise.resolve())
  const claim = vi.fn(() => Promise.resolve())
  const enablePreload = vi.fn((): Promise<void> => Promise.resolve())
  /** The Badging API of the worker's navigator: what the worker asked the OS to show. A test that wants a browser without it passes badgeApi: false. */
  const setAppBadge = vi.fn((_count?: number): Promise<void> => Promise.resolve())
  const clearAppBadge = vi.fn((): Promise<void> => Promise.resolve())
  const showNotification = vi.fn((_title: string, _options?: unknown): Promise<void> => Promise.resolve())
  const openWindow = vi.fn((_url: string): Promise<unknown> => Promise.resolve(null))
  const posted: unknown[] = []
  /** What the worker posted on a BroadcastChannel, as { channel, message }. */
  const channelPosts: Array<{ channel: string; message: unknown }> = []
  /** The worker's own IndexedDB: one per setup, empty. */
  const indexedDb = new IDBFactory()
  /** Web Locks: one holder at a time per name, the others queue. `lockNames` records every request. */
  const lockTails = new Map<string, Promise<unknown>>()
  const lockNames: string[] = []
  let offline = false
  let unreadable = false
  let writesFail = false
  /** Bucket names whose deletion is refused, as when the browser cannot remove one. */
  let undeletable = new Set<string>()
  /** The open windows the worker can message. Each records what it was sent. */
  let windows: Array<Record<string, unknown> & { postMessage: (message: unknown) => void }> = [{ postMessage: (message) => void posted.push(message) }]
  const waited: Array<Promise<unknown>> = []
  const warnings: unknown[][] = []

  const absolute = (input: string): string => new URL(input, ORIGIN).href
  const urlOf = (input: string | { url: string }): string => (typeof input === 'string' ? absolute(input) : input.url)

  // A browser allows only so many connections to one host, and a connection stays busy until its response body has been read to the
  // end. With a limit set, a download waits for a free connection, and a body frees its connection only when somebody reads it.
  let busy = 0
  const waiting: Array<() => void> = []
  const connect = async (): Promise<void> => {
    if (options.connectionLimit === undefined) return
    while (busy >= options.connectionLimit) await new Promise<void>((resolve) => waiting.push(resolve))
    busy += 1
  }
  const disconnect = (): void => {
    if (options.connectionLimit === undefined) return
    busy -= 1
    waiting.shift()?.()
  }

  const fakeFetch = async (input: { url: string; cache?: string; headers?: Headers; signal?: AbortSignal }): Promise<Response> => {
    await connect()
    const url = new URL(input.url)
    requested.push({ url: url.pathname, cache: input.cache ?? 'default', accept: input.headers?.get('accept') ?? null })
    if (input.headers) forwarded.push(input.headers)
    if (offline) {
      disconnect()
      throw new TypeError('Failed to fetch')
    }
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
    if (!entry) {
      disconnect()
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    }
    let body: string | ReadableStream
    if (entry.brokenBody) {
      disconnect()
      body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"par'))
          controller.error(new TypeError('network error'))
        },
      })
    } else if (options.connectionLimit === undefined) {
      body = entry.body ?? 'x'
    } else {
      // The connection is released when the body has been read to the end, and not before.
      const bytes = new TextEncoder().encode(entry.body ?? 'x')
      body = new ReadableStream(
        {
          pull(controller) {
            controller.enqueue(bytes)
            controller.close()
            disconnect()
          },
        },
        // Nothing is pulled until somebody reads: a stream asks for its first chunk at once otherwise, which would free the connection early.
        { highWaterMark: 0 },
      )
    }
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
    async delete(name: string) {
      if (undeletable.has(name)) throw new DOMException('The cache cannot be deleted', 'InvalidStateError')
      return stores.delete(name)
    },
  }

  // A worker's `navigator` is the same object as `self.navigator`: Web Locks and, where the browser has it, the Badging API.
  const workerNavigator = {
    locks: {
      request: async (name: string, callback: () => Promise<unknown>) => {
        lockNames.push(name)
        const run = (lockTails.get(name) ?? Promise.resolve()).then(() => callback())
        lockTails.set(name, run.catch(() => undefined))
        return run
      },
    },
    ...(options.badgeApi === false ? {} : { setAppBadge, clearAppBadge }),
  }

  const sandbox = {
    self: {
      location: { origin: ORIGIN },
      navigator: workerNavigator,
      addEventListener: (type: string, handler: Handler) => void handlers.set(type, handler),
      skipWaiting,
      registration: { navigationPreload: { enable: enablePreload }, showNotification },
      clients: { claim, matchAll: async () => windows, openWindow },
    },
    caches: fakeCaches,
    indexedDB: indexedDb,
    navigator: workerNavigator,
    BroadcastChannel: class {
      constructor(private readonly name: string) {}
      postMessage(message: unknown): void {
        channelPosts.push({ channel: this.name, message })
      }
      close(): void {}
    },
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
  if (options.internals) vm.runInNewContext(INTERNALS_SOURCE, sandbox)
  vm.runInNewContext(workerSource(urls), sandbox)

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
  const dispatch = async (request: { method?: string; url: string; mode?: string; headers?: Headers; preload?: () => Promise<Response | undefined> }): Promise<Response | 'not handled'> => {
    let answer: Promise<Response> | undefined
    // A real Request, as the browser hands the worker. A navigation cannot be built that way, so its mode is set on the instance.
    const real = new SandboxRequest(request.url, { method: request.method ?? 'GET', headers: request.headers })
    if (request.mode && request.mode !== 'cors') Object.defineProperty(real, 'mode', { value: request.mode })
    handler('fetch')({
      request: real,
      // What the browser's navigation preload gave, if anything: undefined when none was started.
      preloadResponse: request.preload ? request.preload() : Promise.resolve(undefined),
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
    forwarded,
    sandbox,
    stores,
    skipWaiting,
    claim,
    enablePreload,
    showNotification,
    openWindow,
    setAppBadge,
    clearAppBadge,
    posted,
    channelPosts,
    indexedDb,
    lockNames,
    setOffline: (value: boolean) => void (offline = value),
    setCacheUnreadable: (value: boolean) => void (unreadable = value),
    setWritesFail: (value: boolean) => void (writesFail = value),
    setUndeletable: (names: string[]) => void (undeletable = new Set(names)),
    setWindows: (list: Array<Record<string, unknown> & { postMessage: (message: unknown) => void }>) => void (windows = list),
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

export const SLUGS = ['arrival-and-handover', 'power-and-fuel', 'loss-of-contact-procedures']
export const BENCH_KEYS = ['alpha', 'beta', 'gamma', 'delta']
export const JSON_TYPE = 'application/json; charset=utf-8'
export const SERVED_AT = '2026-01-01T00:00:00.000Z'

export const json = (body: unknown, headers?: Record<string, string>): Served => ({ type: JSON_TYPE, body: JSON.stringify(body), headers })

export const chapterBody = (slug: string, edition: string) => ({ slug, number: 1, title: slug, summary: 'summary', readMinutes: 3, edition, blocks: [] })

/** The handbook and the bench as the server answers them. Each carries X-Served-At, the header that says how old the data is. */
export function apiFixtures(edition = '1988.4'): Record<string, Served> {
  return {
    '/api/handbook': json({ edition, updatedAt: SERVED_AT, chapters: SLUGS.map((slug, i) => ({ slug, number: i + 1, title: slug, summary: 'summary', readMinutes: 3 })) }, { 'X-Served-At': SERVED_AT }),
    ...Object.fromEntries(SLUGS.map((slug) => [`/api/handbook/${slug}`, json(chapterBody(slug, edition), { 'X-Served-At': SERVED_AT })])),
    ...Object.fromEntries(BENCH_KEYS.map((key) => [`/api/bench/cache-only/${key}`, json({ strategy: 'cache-only', key, rev: 1, hits: 1, payload: { label: key, sample: 1 } }, { 'X-Served-At': SERVED_AT })])),
  }
}

export const HEALTHY: Record<string, Served> = {
  '/index.html': { type: 'text/html; charset=utf-8', body: '<html>shell</html>' },
  '/assets/index-AAA.js': { body: 'console.log(1)' },
  '/assets/index-BBB.css': { type: 'text/css', body: 'body{}' },
  '/assets/font-CCC.woff2': { type: 'font/woff2', body: 'font' },
  ...apiFixtures(),
}

export const text = async (r: Response | 'not handled'): Promise<string> => (r === 'not handled' ? 'not handled' : r.text())

/** The records in a worker's outbox (raw IndexedDB, so a test does not depend on the code it checks). */
export async function readOutbox(sw: { indexedDb: InstanceType<typeof IDBFactory> }): Promise<Array<Record<string, unknown>>> {
  const database = await new Promise<InstanceType<typeof IDBDatabase>>((resolve, reject) => {
    const request = sw.indexedDb.open('outpost-outbox', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('outbox', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const all = await new Promise<Array<Record<string, unknown>>>((resolve) => {
    const request = database.transaction('outbox').objectStore('outbox').getAll()
    request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>)
  })
  database.close()
  return all.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
}

/** Puts records into a worker's outbox, as the page would have. */
export async function seedOutbox(sw: { indexedDb: InstanceType<typeof IDBFactory> }, records: Array<Record<string, unknown>>): Promise<void> {
  const database = await new Promise<InstanceType<typeof IDBDatabase>>((resolve, reject) => {
    const request = sw.indexedDb.open('outpost-outbox', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('outbox', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('outbox', 'readwrite')
    for (const record of records) transaction.objectStore('outbox').put(record)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

/** A queued record, as the page writes it. */
export const queuedRecord = (id: string, patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  attempts: 0,
  status: 'queued',
  lastError: null,
  payload: { clientId: id, stationId: 'KRN-07', title: `Dispatch ${id}`, body: 'Body', severity: 'routine', tags: [], coords: null },
  ...patch,
})
