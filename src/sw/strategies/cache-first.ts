// What it holds:  the CACHE-FIRST strategy: cacheFirst(), and the CacheFirstRule shape that says what each cache-first route stores.
// What it means: look in the cache BEFORE anything else; the network is asked only on a miss. Fast and works offline, but it never
//                notices that the server changed: a stored copy is served for as long as it exists. That is right for things that never
//                change under the same URL (a hashed script, a plate for one dispatch id) and wrong for anything else, which is why the
//                unhashed files (/favicon.svg, /icons/*, /version.json) are not routed here.
// Caching type:  runtime (it fills its buckets after a miss). The /assets rule also READS shell-v1, which is precache.
// Caches touched: media-v1 (/media/*), assets-v1 (/assets/* not in the shell; shell-v1 is read first), api-v1 (/api/bench/cache-first/<key>).
//
// What it does, step by step:
//   1. Look the exact URL up in the rule's buckets, in order (query string included).
//   2. Hit: answer the stored copy, stamped X-SW-Source: cache, X-SW-Strategy: cache-first, X-SW-Cache: <the bucket it was in>.
//   3. Miss: ask the network. If the network fails, the page gets the real failure (an image that does not load, a chunk that does not
//      load, an offline error on the Bench card); there is no made-up answer.
//   4. Store the answer only if it is a 200, not zero bytes, and it passes the rule's check (isImage, isAsset, isBenchEntry). The write
//      is a clone handed to event.waitUntil, so the page gets the original without waiting and the worker is kept alive until it is done.
//   5. Answer the network response stamped X-SW-Source: network.
// Routes and their rules: see routes.ts.

import { stamped } from '../lib/headers'
import { lookup, store, type CacheTarget } from '../caching/runtime'

/** A cache-first route: where it reads and writes (CacheTarget) and the check an answer must pass before it may be stored. */
export interface CacheFirstRule extends CacheTarget {
  readonly accepts: (response: Response, url: URL) => Promise<boolean>
}

/**
 * Cache first: the stored copy if there is one, and the network only when there is not. The exact URL is the key, query string included.
 * A network failure on a miss is not turned into a made-up answer: the page gets the real failure. Only an answer that passes the rule's
 * check is stored, and it is stored from a clone inside event.waitUntil.
 */
export async function cacheFirst(event: FetchEvent, request: Request, rule: CacheFirstRule): Promise<Response> {
  const url = new URL(request.url)
  const found = await lookup(rule, url.href)
  if (found) return stamped(found.hit, 'cache', 'cache-first', found.cacheName)
  const response = await fetch(request)
  const storable = response.status === 200 && response.headers.get('content-length') !== '0' && (await rule.accepts(response, url))
  if (storable) event.waitUntil(store(rule, url, response.clone()))
  return stamped(response, 'network', 'cache-first', rule.writeTo)
}
