// What it holds:  the CACHE-ONLY strategy: isCacheOnly(), cacheMiss() and cacheOnly().
// What it means: answer from the cache and NOTHING ELSE. The stored copy if there is one, otherwise a "not stored" answer; the network is
//                never asked, even when it is up. That is only safe for data you stored on purpose, at install, and it is the one
//                strategy where "the server has something newer" is deliberately ignored: the stored handbook only changes with a new
//                install (a new build).
// Caching type:  precache (it READS precache-v1, which the install wrote; it never writes).
// Caches touched: precache-v1 (read): /api/handbook, /api/handbook/<slug> and /api/bench/cache-only/{alpha,beta,gamma}.
//
// What it does, step by step:
//   1. Look the exact URL up in precache-v1 (query string included: '/api/handbook?x=1' is a different URL and a miss).
//   2. Hit: answer the stored copy, stamped X-SW-Source: cache, X-SW-Strategy: cache-only, X-SW-Cache: precache-v1.
//   3. Miss, or a bucket that cannot be read: answer 504 with X-SW-Source: cache-miss and an error body in the server's own shape. The
//      page turns that exact pair into its "Not stored for offline use" screen.
// Routes: see routes.ts.

import { BENCH_CACHE_ONLY, HANDBOOK_URL, PRECACHE_CACHE } from '../config'
import { CACHE_HEADER, SOURCE_HEADER, STRATEGY_HEADER, stamped } from '../lib/headers'

/**
 * Exactly the handbook index, its chapters, and the bench's cache-only routes. The match is on the path with a boundary: '/api/handbook'
 * itself or something under '/api/handbook/', never a name that merely starts with those letters.
 */
export function isCacheOnly(pathname: string): boolean {
  return pathname === HANDBOOK_URL || pathname.startsWith(`${HANDBOOK_URL}/`) || pathname.startsWith(BENCH_CACHE_ONLY)
}

/**
 * The answer for a cache-only URL that was not stored: 504 with X-SW-Source: cache-miss, and a body in the server's own error shape.
 * That exact pair is what the page turns into its "Not stored for offline use" screen. Deliberately not a network error (the page
 * would read it as "offline") and not an answer from the network (this route must never go there). No X-Served-By: that header
 * means "the server answered", and the server did not.
 */
function cacheMiss(url: URL): Response {
  const body = {
    error: {
      code: 'unavailable',
      message: `Not stored for offline use: ${url.pathname}. This route is answered from the install-time cache and never from the network.`,
      requestId: `sw-${Date.now().toString(36)}`,
    },
  }
  return new Response(JSON.stringify(body), {
    status: 504,
    statusText: 'Not stored for offline use',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      [SOURCE_HEADER]: 'cache-miss',
      [STRATEGY_HEADER]: 'cache-only',
      [CACHE_HEADER]: PRECACHE_CACHE,
    },
  })
}

/**
 * Cache only: the stored copy or the miss, never the network. The lookup is the exact URL, query string included, so '/api/handbook?x=1'
 * is a miss rather than quietly returning the unfiltered copy. A cache that cannot be read is treated as a miss too: the page then shows
 * the same screen instead of a generic network failure.
 */
export async function cacheOnly(url: URL): Promise<Response> {
  let hit: Response | undefined
  try {
    hit = await caches.match(url.href, { cacheName: PRECACHE_CACHE })
  } catch {
    hit = undefined
  }
  if (!hit) return cacheMiss(url)
  return stamped(hit, 'cache', 'cache-only', PRECACHE_CACHE)
}
