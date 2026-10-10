// What it holds:  the NETWORK-FIRST strategy: networkFirst() and storeLate().
// What it means: ask the network first and give it a deadline; if it answers well in time, use that (and keep a copy); if it fails, is
//                too slow or answers with something unusable, answer the LAST STORED COPY instead. Fresh when the link is good, still
//                useful when it is not. The price: when it falls back, the page gets an old answer and must be told (the stamps do that).
// Caching type:  runtime (it keeps a copy of every good answer, and reads it back only on a failure).
// Caches touched: api-v1: /api/dispatches (every query), /api/dispatches/<id>, /api/inbox/summary, /api/digest.
//
// What it does, step by step:
//   1. Start the network request (tryNetwork, which reads the whole body) and a NETWORK_TIMEOUT_MS timer, and wait for the first to end.
//   2. Good in time: store a clone, answer it stamped X-SW-Source: network.
//   3. A real answer that is not a failure (401, 403, 404...): hand it over as it is. A stored copy must never hide a signed-out
//      session or a deleted dispatch.
//   4. Otherwise (network error, timeout, 5xx, 429, HTML, broken body): look the exact URL up in api-v1. Found: answer it stamped
//      X-SW-Source: fallback with X-SW-Fallback-Reason (network, timeout, status-503, content-type, body). If it was the timer that
//      fired, the slow request is not abandoned: if it later finishes well it refreshes the stored copy (storeLate).
//   5. Nothing stored: there is nothing to fall back to, so the real outcome goes through. A slow request is waited for (aborting one
//      that would have worked only makes the page fail), a bad response reaches the page as it is, and a failed fetch is rethrown, so
//      the page fails the way it would without a worker.
// Routes: see routes.ts.

import { API_CACHE, API_LIMIT, NETWORK_TIMEOUT_MS } from '../config'
import { FALLBACK_REASON_HEADER, stamped } from '../lib/headers'
import { tryNetwork, type Attempt } from '../lib/network'
import { lookup, store, type CacheTarget } from '../caching/runtime'

/** Where network first reads and writes: api-v1, capped at API_LIMIT. */
const NETWORK_FIRST: CacheTarget = { readFrom: [API_CACHE], writeTo: API_CACHE, limit: API_LIMIT }

/** Stores a late answer, one that arrived after the page had already been given the stored copy. */
async function storeLate(attempt: Promise<Attempt>, url: URL): Promise<void> {
  const result = await attempt
  if (result.kind === 'good') await store(NETWORK_FIRST, url, result.response)
}

/** Network first: see the step list at the top of this file. */
export async function networkFirst(event: FetchEvent, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const attempt = tryNetwork(request, url)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<undefined>((resolve) => {
    timer = setTimeout(resolve, NETWORK_TIMEOUT_MS)
  })
  const early = await Promise.race([attempt, timedOut])
  clearTimeout(timer)

  if (early?.kind === 'good') {
    event.waitUntil(store(NETWORK_FIRST, url, early.response.clone()))
    return stamped(early.response, 'network', 'network-first', API_CACHE)
  }
  if (early?.kind === 'real') return stamped(early.response, 'network', 'network-first', API_CACHE)

  const reason = early ? early.reason : 'timeout'
  const found = await lookup(NETWORK_FIRST, url.href)
  if (found) {
    if (!early) event.waitUntil(storeLate(attempt, url))
    const answer = stamped(found.hit, 'fallback', 'network-first', found.cacheName)
    answer.headers.set(FALLBACK_REASON_HEADER, reason)
    return answer
  }

  const outcome = early ?? (await attempt)
  if (outcome.kind === 'good') event.waitUntil(store(NETWORK_FIRST, url, outcome.response.clone()))
  if (outcome.kind !== 'failed') return stamped(outcome.response, 'network', 'network-first', API_CACHE)
  throw outcome.error
}
