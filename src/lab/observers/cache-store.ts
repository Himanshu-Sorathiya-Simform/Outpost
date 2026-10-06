/** Read and delete operations on Cache Storage. Nothing here writes an entry: only a worker would do that. */

export interface CacheSupport {
  available: boolean
  reason: string | null
}

export function cacheSupport(): CacheSupport {
  if (typeof caches !== 'undefined') return { available: true, reason: null }
  const insecure = typeof isSecureContext === 'boolean' && !isSecureContext
  return {
    available: false,
    reason: insecure
      ? `Cache Storage only exists in secure contexts (HTTPS, or localhost). This page is at ${location.origin}, which is neither, so window.caches is undefined. Serve the app over HTTPS or open it through localhost.`
      : 'This browser does not define window.caches. Cache Storage arrived with service workers; very old browsers and some embedded web views lack both.',
  }
}

/** caches.open() creates a missing cache. A Lab instrument must never do that, so look first. */
export async function openExisting(name: string): Promise<Cache | null> {
  return (await caches.has(name)) ? caches.open(name) : null
}

export interface CacheSummary {
  name: string
  count: number | null
  /** This cache could not be read; the others are unaffected. */
  error: string | null
}

const messageOf = (err: unknown): string => (err instanceof Error ? `${err.name}: ${err.message}` : String(err))

export async function readCacheSummaries(): Promise<CacheSummary[]> {
  const names = await caches.keys()
  return Promise.all(
    names.map(async (name): Promise<CacheSummary> => {
      try {
        const cache = await openExisting(name)
        return { name, count: cache ? (await cache.keys()).length : 0, error: null }
      } catch (err) {
        return { name, count: null, error: messageOf(err) }
      }
    }),
  )
}

export async function listRequests(name: string): Promise<Request[]> {
  const cache = await openExisting(name)
  return cache ? [...(await cache.keys())] : []
}

export interface EntryMeta {
  /** The entry was deleted between listing the keys and reading it. */
  missing: boolean
  status: number
  statusText: string
  type: ResponseType
  opaque: boolean
  redirected: boolean
  contentType: string | null
  contentLength: number | null
  date: string | null
  cachedAt: string | null
  vary: string | null
  headers: Array<[string, string]>
}

const EMPTY_META: EntryMeta = { missing: true, status: 0, statusText: '', type: 'default', opaque: false, redirected: false, contentType: null, contentLength: null, date: null, cachedAt: null, vary: null, headers: [] }

export function metaOf(res: Response): EntryMeta {
  const length = res.headers.get('content-length')
  const parsed = length === null ? null : Number(length)
  return {
    missing: false,
    status: res.status,
    statusText: res.statusText,
    type: res.type,
    opaque: res.type === 'opaque' || res.type === 'opaqueredirect',
    redirected: res.redirected,
    contentType: res.headers.get('content-type'),
    contentLength: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    date: res.headers.get('date'),
    cachedAt: res.headers.get('x-sw-cached-at'),
    vary: res.headers.get('vary'),
    headers: [...res.headers.entries()],
  }
}

export async function readEntryMeta(name: string, request: Request): Promise<EntryMeta> {
  const cache = await openExisting(name)
  const res = cache ? await cache.match(request, { ignoreVary: true }) : undefined
  return res ? metaOf(res) : EMPTY_META
}

export async function deleteEntry(name: string, request: Request): Promise<boolean> {
  const cache = await openExisting(name)
  return cache ? cache.delete(request, { ignoreVary: true }) : false
}

export const deleteCache = (name: string): Promise<boolean> => caches.delete(name)

export async function deleteAllCaches(): Promise<number> {
  const names = await caches.keys()
  const results = await Promise.all(names.map((n) => caches.delete(n)))
  return results.filter(Boolean).length
}

export interface Measurement {
  measured: number
  total: number
  bytes: number
  /** Opaque responses hide their size. */
  opaque: number
  capped: boolean
}

export const MEASURE_CAP = 500

/** Reads body sizes one small batch at a time so the tab stays responsive. Stops when the signal aborts. */
export async function measureCache(name: string, onProgress: (done: number, total: number) => void, signal: AbortSignal): Promise<Measurement> {
  const cache = await openExisting(name)
  const keys = cache ? await cache.keys() : []
  const limit = Math.min(keys.length, MEASURE_CAP)
  const result: Measurement = { measured: 0, total: keys.length, bytes: 0, opaque: 0, capped: keys.length > MEASURE_CAP }
  if (!cache) return result
  for (let i = 0; i < limit && !signal.aborted; i += 10) {
    await Promise.all(
      keys.slice(i, Math.min(i + 10, limit)).map(async (req) => {
        const res = await cache.match(req, { ignoreVary: true })
        if (!res) return
        if (res.type === 'opaque' || res.type === 'opaqueredirect') result.opaque += 1
        else result.bytes += (await res.blob()).size
        result.measured += 1
      }),
    )
    onProgress(result.measured, limit)
  }
  return result
}

/** Display form of a request URL: path and query when it is this origin, the whole URL otherwise. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.origin === location.origin ? `${u.pathname}${u.search}` : url
  } catch {
    return url
  }
}
