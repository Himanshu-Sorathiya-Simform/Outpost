// What it holds:  the names of the headers the worker reads and writes, and the two helpers that put them on a response.
// What it means: the worker tells the page where an answer came from by stamping headers on it. The page reads them (src/lib/api,
//                Lab -> Bench, Lab -> Network) and shows "SW cache", "SW network" or "SW fallback". The names are checked against
//                shared/contracts.ts at compile time, so the worker and the page cannot drift apart. Only the type is imported, so none of
//                the page's validation library is bundled into the worker.
// Caching type:  none (a stamped response is built here; where it is stored is decided by the caching types).
// Caches touched: none.

import type { HDR } from '@shared/contracts'

// Each constant is typed as the page's own constant, so a rename there is a compile error here.
export const SOURCE_HEADER: typeof HDR.swSource = 'X-SW-Source'
export const STRATEGY_HEADER: typeof HDR.swStrategy = 'X-SW-Strategy'
export const CACHE_HEADER: typeof HDR.swCache = 'X-SW-Cache'
export const CACHED_AT_HEADER: typeof HDR.swCachedAt = 'X-SW-Cached-At'
export const REVISION_HEADER: typeof HDR.rev = 'X-Resource-Rev'

/** Not in the contract: why a fallback was answered (network, timeout, status-503, content-type, body). Visible in DevTools only. */
export const FALLBACK_REASON_HEADER = 'X-SW-Fallback-Reason'

/**
 * Where an answer came from. `cache` and `network` are what they say; `fallback` is a stored copy answered because the network failed
 * (network first); `cache-miss` is the 504 for a cache-only URL that was never stored.
 */
export type Source = 'cache' | 'network' | 'fallback' | 'cache-miss'

/**
 * A copy of the response that says where it came from. The page reads these three headers to show "SW cache" or "SW network" on the
 * Bench card and in Lab -> Network. Response headers are read-only, which is why this builds a new Response. The body is passed on as a
 * stream, not copied. No cache name means no cache was involved (network only).
 */
export function stamped(response: Response, source: Source, strategy: string, cacheName?: string): Response {
  const headers = new Headers(response.headers)
  headers.set(SOURCE_HEADER, source)
  headers.set(STRATEGY_HEADER, strategy)
  if (cacheName) headers.set(CACHE_HEADER, cacheName)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

/**
 * A copy of the response with the time it was stored added. Everything else is kept as it was, X-Served-At included: that header
 * is the data's true age, and a stored copy that looked freshly served would hide how old it is.
 */
export function stampForStorage(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set(CACHED_AT_HEADER, new Date().toISOString())
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
