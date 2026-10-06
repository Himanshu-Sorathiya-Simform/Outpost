import type { ResponseMeta } from '@/lib/api/types'
import type { AppError } from '@/lib/errors/app-error'

/**
 * How the data on screen reached this page, in the only terms an operator cares about.
 *   live           the relay answered this request itself
 *   stored         something between the page and the relay answered (a worker's cache, the browser's HTTP cache)
 *   earlier-visit  restored from the persisted query cache, last fetched before this page load
 *   fallback       a worker invented the answer
 */
export type Delivery = 'live' | 'stored' | 'earlier-visit' | 'fallback'

/**
 * A cache source only makes the data a "stored copy" when the body itself is older than this on arrival. A response the
 * browser revalidated with the relay (a 304) is reported as cache-delivered too, but its body is as fresh as a new one.
 */
const STORED_AFTER_MS = 5000

export function describeDelivery(meta: ResponseMeta | undefined, dataUpdatedAt: number): Delivery {
  if (meta?.source === 'sw-fallback') return 'fallback'
  if ((meta?.source === 'sw-cache' || meta?.source === 'http-cache') && (meta.dataAgeMs === null || meta.dataAgeMs > STORED_AFTER_MS)) return 'stored'
  if (dataUpdatedAt > 0 && dataUpdatedAt < performance.timeOrigin) return 'earlier-visit'
  return 'live'
}

/** When the data itself was produced: the server clock if the response carried it, else when it arrived. */
export function dataTimestamp(meta: ResponseMeta | undefined, dataUpdatedAt: number): string | number {
  return meta?.servedAt ?? meta?.swCachedAt ?? meta?.fetchedAt ?? dataUpdatedAt
}

interface FailureSource {
  error: AppError | null
  isPaused: boolean
  failureReason: AppError | null
}

/**
 * The failure to put in front of the operator. A fetch that failed while the device is offline does not settle into an
 * error (the retries wait for a connection), so its last failure is used as soon as it is paused: nobody should stare
 * at a skeleton for a request that is waiting on a network that is not there.
 */
export const currentFailure = (q: FailureSource): AppError | null => q.error ?? (q.isPaused ? q.failureReason : null)
