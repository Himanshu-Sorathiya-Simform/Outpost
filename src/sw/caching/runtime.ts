// What it holds:  the RUNTIME caching type: the shared machinery for filling a bucket while the app runs. lookup() (find a stored copy),
//                 store() (write one, with the never-cached guard, the size cap and a second try on a full disk) and trim() (the cap), plus the
//                 CacheTarget shape every route uses to say which buckets it reads and writes.
// What it means: "runtime" caching means the bucket starts empty and fills as the app is used: a request misses, the answer is fetched
//                and stored (or a background refresh finds something newer and replaces the copy). Contrast with precache (filled once at
//                install, before anyone asks) and on-demand (filled because the page asked). Runtime buckets can hold only what was
//                actually requested, so they are capped, and every write is validated first by whoever calls store() (the strategy's own check:
//                content type, image or asset rules, tryNetwork, the shape check). A write that fails never fails the page: a full disk
//                (QuotaExceededError) makes room by deleting the bucket's oldest entries and tries once more; anything else is logged.
// Caching type:  runtime.
// Caches touched: media-v<N>, assets-v<N> and api-v<N> (written); shell-v<N> is also read by the /assets rule of cache-first.
//
// Who uses the runtime type:
//   cache-first               media-v<N> (/media/*), assets-v<N> (lazy chunks), api-v<N> (/api/bench/cache-first/*)
//   network-first             api-v<N> (/api/dispatches*, /api/inbox/summary, /api/digest)
//   stale-while-revalidate    api-v<N> (/api/stations*, /api/bench/stale-while-revalidate/*)
//   periodic sync handler     api-v<N> (the newest digest, under the plain /api/digest; src/sw/periodic-sync.ts)

import { NEVER_CACHED, QUOTA_TRIM_ENTRIES } from '../config'
import { stampForStorage } from '../lib/headers'

/** Which buckets a route reads (in this order), which one it writes, and how many entries that one may hold (0 means no cap). */
export interface CacheTarget {
  readonly readFrom: readonly string[]
  readonly writeTo: string
  readonly limit: number
}

/** True for a URL that must never be stored: every NEVER_CACHED entry matches the path itself and everything under it. */
export const isNeverCached = (pathname: string): boolean => NEVER_CACHED.some((base) => pathname === base || pathname.startsWith(`${base}/`))

/** The first stored copy of the URL, with the name of the bucket it was in. A bucket that cannot be read counts as one that has nothing. */
export async function lookup(target: CacheTarget, href: string): Promise<{ hit: Response; cacheName: string } | undefined> {
  for (const cacheName of target.readFrom) {
    try {
      const hit = await caches.match(href, { cacheName })
      if (hit) return { hit, cacheName }
    } catch {
      // keep looking in the next bucket, then go to the network
    }
  }
  return undefined
}

/**
 * Deletes the `count` oldest entries (cache.keys() lists them in the order they were stored), except the one being written: if the write
 * still fails, the copy it was meant to replace must still be there. Says how many it deleted.
 */
async function dropOldest(cache: Cache, count: number, keep: string): Promise<number> {
  const doomed = (await cache.keys()).filter((key) => key.url !== keep).slice(0, count)
  for (const key of doomed) await cache.delete(key)
  return doomed.length
}

/** Keeps the newest `limit` entries. cache.keys() lists them in the order they were stored, so the oldest go first. */
async function trim(cache: Cache, limit: number): Promise<void> {
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key)
}

const isQuotaError = (error: unknown): boolean => typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'QuotaExceededError'

/**
 * Stores one answer, stamped with the time it was stored. By now the page already has its response, so a failure here (a full disk, a
 * revoked cache) must not turn into an error for the page: it is logged and the next request tries again. A full disk (QuotaExceededError)
 * gets one more try after the bucket's QUOTA_TRIM_ENTRIES oldest entries (never the one being replaced) are deleted; a second failure is logged like any other. A URL on the
 * never-cached list is refused whatever asked. Says whether the write happened.
 */
export async function store(target: CacheTarget, url: URL, response: Response): Promise<boolean> {
  if (isNeverCached(url.pathname)) {
    console.warn(`Outpost worker: refused to store ${url.pathname}, it is on the never-cached list`)
    return false
  }
  try {
    const cache = await caches.open(target.writeTo)
    // A body can be read once, so the second try needs its own copy, taken before the first try uses the original.
    const spare = response.clone()
    try {
      await cache.put(url.href, stampForStorage(response))
    } catch (error) {
      if (!isQuotaError(error)) throw error
      const dropped = await dropOldest(cache, QUOTA_TRIM_ENTRIES, url.href)
      console.warn(`Outpost worker: ${target.writeTo} was full, dropped its ${dropped} oldest entries and tried ${url.pathname} again`)
      await cache.put(url.href, stampForStorage(spare))
    }
    if (target.limit > 0) await trim(cache, target.limit)
    return true
  } catch (error) {
    console.warn(`Outpost worker: could not store ${url.pathname} in ${target.writeTo}`, error)
    return false
  }
}
