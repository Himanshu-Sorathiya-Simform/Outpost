import { HandbookIndex } from '@shared/contracts'
import { metaOf, openExisting, shortUrl, type EntryMeta } from './cache-store'

export interface MatchOptions {
  method: 'GET' | 'HEAD' | 'POST'
  ignoreSearch: boolean
  ignoreMethod: boolean
  ignoreVary: boolean
  /** Send Accept: application/json, as the app's fetches do. A bare Request carries no Accept header, which matters for a stored response that varies on it. */
  accept: boolean
  /** Empty = search every cache in creation order, like caches.match. */
  cacheName: string
}

export type MatchResult =
  | { hit: true; cacheName: string; key: string; meta: EntryMeta; ms: number; searched: number }
  /** `vary`: the Vary header of a stored response that would have matched if Vary were ignored, else null. */
  | { hit: false; ms: number; searched: number; vary: string | null }

export const DEFAULT_MATCH: MatchOptions = { method: 'GET', ignoreSearch: false, ignoreMethod: false, ignoreVary: false, accept: false, cacheName: '' }

/** caches.match(), unrolled so it can say which cache answered and which stored entry matched. */
export async function runMatch(input: string, options: MatchOptions = DEFAULT_MATCH): Promise<MatchResult> {
  const started = performance.now()
  const request = new Request(new URL(input, location.href), { method: options.method, headers: options.accept ? { Accept: 'application/json' } : undefined })
  const names = options.cacheName ? [options.cacheName] : await caches.keys()
  const matchOptions: CacheQueryOptions = { ignoreSearch: options.ignoreSearch, ignoreMethod: options.ignoreMethod, ignoreVary: options.ignoreVary }
  let searched = 0
  let vary: string | null = null
  for (const name of names) {
    const cache = await openExisting(name)
    if (!cache) continue
    searched += 1
    const res = await cache.match(request, matchOptions)
    if (!res && !options.ignoreVary && vary === null) vary = (await cache.match(request, { ...matchOptions, ignoreVary: true }))?.headers.get('Vary') ?? null
    if (res) {
      const [key] = await cache.keys(request, matchOptions)
      return { hit: true, cacheName: name, key: key ? shortUrl(key.url) : shortUrl(request.url), meta: metaOf(res), ms: Math.round(performance.now() - started), searched }
    }
  }
  return { hit: false, ms: Math.round(performance.now() - started), searched, vary }
}

/** How many stored entries have a pathname starting with `prefix`, and in how many caches. */
export async function countByPrefix(prefix: string): Promise<{ entries: number; caches: number }> {
  let entries = 0
  let inCaches = 0
  for (const name of await caches.keys()) {
    const cache = await openExisting(name)
    if (!cache) continue
    const n = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith(prefix)).length
    entries += n
    if (n > 0) inCaches += 1
  }
  return { entries, caches: inCaches }
}

/** Chapter slugs from a cached copy of the handbook index, or null when no cache holds a usable one. */
export async function cachedHandbookSlugs(): Promise<string[] | null> {
  const res = await caches.match('/api/handbook')
  if (!res) return null
  try {
    const parsed = HandbookIndex.safeParse(await res.json())
    return parsed.success ? parsed.data.chapters.map((c) => c.slug) : null
  } catch {
    return null
  }
}
