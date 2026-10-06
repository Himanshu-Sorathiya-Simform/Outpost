/** Where did this response physically come from? Best-effort — see provenance.ts. */
export type ResponseSource =
  | 'network' // hit the server (request log on the server will show it)
  | 'sw-cache' // service worker answered from Cache Storage (X-SW-Source: cache)
  | 'sw-network' // service worker fetched it (X-SW-Source: network | revalidated)
  | 'sw-fallback' // service worker synthesised it (X-SW-Source: fallback)
  | 'http-cache' // browser HTTP cache (transferSize 0, no SW involvement signalled)
  | 'unknown'

/** Everything we can learn about one response, attached to every successful apiFetch. */
export interface ResponseMeta {
  url: string
  method: string
  status: number
  requestId: string | null
  /** Server clock when it generated the body (X-Served-At). This is the freshness of the DATA. */
  servedAt: string | null
  servedBy: string | null
  /** Client clock when the response finished arriving. */
  fetchedAt: string
  durationMs: number
  source: ResponseSource
  /** Why `source` was decided: 'header:X-SW-Source=cache', 'heuristic:transferSize=0', ... */
  sourceReason: string
  /** Age of the data in ms at fetch time: fetchedAt - servedAt. Large + source 'network' ⇒ something upstream cached. */
  dataAgeMs: number | null
  etag: string | null
  cacheControl: string | null
  ageHeader: number | null
  rev: number | null
  apiVersion: number | null
  chaos: string | null
  swSource: string | null
  swStrategy: string | null
  swCache: string | null
  swCachedAt: string | null
  bytes: number | null
  /** PerformanceResourceTiming.transferSize (0 = not over the network) and deliveryType ('cache' in Chrome for SW/HTTP cache). */
  transferSize: number | null
  deliveryType: string | null
  redirected: boolean
  responseType: string
}

export interface ApiResult<T> {
  data: T
  meta: ResponseMeta
}
