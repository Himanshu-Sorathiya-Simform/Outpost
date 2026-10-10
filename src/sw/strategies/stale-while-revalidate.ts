// What it holds:  the STALE-WHILE-REVALIDATE strategy: staleWhileRevalidate(), the background revalidate(), and the "did it change?" check
//                 sameData(). The page is told about a change with a cache-updated message.
// What it means: answer from the cache IMMEDIATELY (the copy may be old: stale), and in the same moment ask the server in the
//                background (revalidate). If what comes back differs, store it and tell the page, so the screen updates a moment later
//                with no reload. Always "one fetch behind" for the first render, never slow. It suits data that changes slowly and
//                where an instant old answer beats a slow fresh one: the station register.
// Caching type:  runtime (it keeps a copy of every good answer and replaces it when the server has something newer).
// Caches touched: api-v1: /api/stations, /api/stations/<code or id>, /api/bench/stale-while-revalidate/<key>.
//
// What it does, step by step:
//   1. Look the exact URL up in api-v1. Found: answer it at once, stamped X-SW-Source: cache, X-SW-Strategy: stale-while-revalidate,
//      and start revalidate(url) inside event.waitUntil so the worker is kept alive until it finishes.
//   2. Not found: nothing stale to show, so wait for the network (no timeout), store a clone and answer it stamped X-SW-Source: network.
//      A bad answer reaches the page as it is; a failed fetch is rethrown, as without a worker.
//   revalidate(url):
//   3. Ask the server with cache 'no-cache' (so the browser's HTTP cache cannot answer for it) and a REVALIDATE_TIMEOUT_MS deadline.
//   4. Only a good answer (tryNetwork) may replace the stored copy. Anything else is ignored, kept out of the cache, and logged to the
//      pages as a warning, because nothing else would report it.
//   5. Same data as the stored copy (by ETag, else X-Resource-Rev, else the body)? Write nothing and post nothing. This is what ends the
//      loop "message -> page refetch -> worker answers and revalidates -> message".
//   6. Different: write it, and only AFTER the write post { type: 'cache-updated', url } to every window, so the refetch that message
//      causes finds the new copy.
// Routes: see routes.ts.

import { API_CACHE, API_LIMIT, REVALIDATE_TIMEOUT_MS } from '../config'
import { REVISION_HEADER, stamped } from '../lib/headers'
import { tellPages } from '../lib/messages'
import { tryNetwork } from '../lib/network'
import { lookup, store, type CacheTarget } from '../caching/runtime'

/** Where stale while revalidate reads and writes: api-v1, capped at API_LIMIT. */
const SWR: CacheTarget = { readFrom: [API_CACHE], writeTo: API_CACHE, limit: API_LIMIT }

/** What a response says about its own version: its ETag, else the resource revision the server counts. null when it says nothing. */
function validatorOf(response: Response): string | null {
  return response.headers.get('etag') || response.headers.get(REVISION_HEADER)
}

/**
 * Is the fresh answer the same data as the stored one? By validator when both have one. The status is not a clue (fetch() returns 200
 * even when the server said 304) and neither is the body of a route that stamps the time into it (the station list carries `asOf`, which
 * moves on every call and would make every check look like a change). Only a route with no validator at all is compared by body.
 */
async function sameData(stored: Response, fresh: Response): Promise<boolean> {
  const a = validatorOf(stored)
  const b = validatorOf(fresh)
  if (a !== null && b !== null) return a === b
  return (await stored.clone().text()) === (await fresh.clone().text())
}

/** The background half of stale while revalidate: see steps 3 to 6 at the top of this file. It never rejects. */
async function revalidate(url: URL): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REVALIDATE_TIMEOUT_MS)
  let result
  try {
    result = await tryNetwork(new Request(url.href, { headers: { Accept: 'application/json' }, cache: 'no-cache', signal: controller.signal }), url)
  } finally {
    clearTimeout(timer)
  }
  if (result.kind !== 'good') {
    const why = result.kind === 'real' ? `status-${result.response.status}` : result.reason
    await tellPages({ type: 'log', level: 'warn', message: `Background revalidation of ${url.pathname} failed (${why}); the stored copy was kept.` })
    return
  }
  const current = await lookup(SWR, url.href)
  if (current && (await sameData(current.hit, result.response))) return
  if (await store(SWR, url, result.response)) {
    await tellPages({ type: 'cache-updated', url: url.pathname, strategy: 'stale-while-revalidate', cacheName: API_CACHE })
  }
}

/** Stale while revalidate: see steps 1 and 2 at the top of this file. */
export async function staleWhileRevalidate(event: FetchEvent, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const found = await lookup(SWR, url.href)
  if (found) {
    event.waitUntil(revalidate(url))
    return stamped(found.hit, 'cache', 'stale-while-revalidate', found.cacheName)
  }
  const result = await tryNetwork(request, url)
  if (result.kind === 'good') event.waitUntil(store(SWR, url, result.response.clone()))
  if (result.kind !== 'failed') return stamped(result.response, 'network', 'stale-while-revalidate', API_CACHE)
  throw result.error
}
