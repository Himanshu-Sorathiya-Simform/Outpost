import type { ResponseMeta } from '@/lib/api/types'
import type { AppError } from '@/lib/errors/app-error'

export type FreshnessCause = 'refresh-failed' | 'paused' | 'cache' | 'restored'

export interface FreshnessInput {
  meta: ResponseMeta | undefined
  /** Something is on screen. Without data there is nothing to be honest about; the error state speaks instead. */
  hasData: boolean
  /** A refetch failed while the previous data stayed on screen. */
  refetchError: AppError | null
  /** The query wants to fetch but is waiting for a connection (lab network mode "online", or no signal). */
  paused: boolean
  /** Epoch ms at which this page's JavaScript started. Data fetched before that came back from storage. */
  pageLoadedAt?: number
}

export interface Freshness {
  cause: FreshnessCause
  tone: 'warn' | 'info'
  title: string
  detail: string
  /** ISO time of the data on screen, for "from N min ago". */
  since: string | null
}

/**
 * Chrome reports a revalidated response (the relay answered 304 to If-None-Match) as delivered from 'cache', and the
 * source heuristic then says http-cache. The server clock settles it: an answer the relay stamped seconds ago was
 * not stored, whatever the transfer size says.
 */
const HTTP_CACHE_STALE_AFTER_MS = 10_000

function isStoredCopy(meta: ResponseMeta): boolean {
  if (meta.source === 'sw-cache' || meta.source === 'sw-fallback') return true
  return meta.source === 'http-cache' && (meta.dataAgeMs === null || meta.dataAgeMs > HTTP_CACHE_STALE_AFTER_MS)
}

/** The moment the data on screen was true: the service worker's write time if it says, else the server clock, else our own. */
export function dataMoment(meta: ResponseMeta | undefined): string | null {
  return meta ? (meta.swCachedAt ?? meta.servedAt ?? meta.fetchedAt) : null
}

const CACHE_DETAIL: Record<string, string> = {
  'sw-cache': 'The service worker answered from its cache.',
  'http-cache': 'The browser answered from its HTTP cache without asking the relay.',
  'sw-fallback': 'The service worker made up this answer because the relay did not give one.',
}

/**
 * Whether what the operator is reading is something other than a fresh answer from the relay, and why.
 * Precedence: a failed refresh beats a paused one beats a cache source beats a restored copy, because each
 * earlier cause explains more of what the operator should do next.
 */
export function describeFreshness({ meta, hasData, refetchError, paused, pageLoadedAt = performance.timeOrigin }: FreshnessInput): Freshness | null {
  if (!hasData) return null
  const since = dataMoment(meta)
  if (refetchError) {
    return { cause: 'refresh-failed', tone: 'warn', title: 'Could not refresh', detail: refetchError.kind === 'offline' ? 'No signal.' : refetchError.userMessage, since }
  }
  if (paused) {
    return { cause: 'paused', tone: 'warn', title: 'Waiting for a signal', detail: 'The refresh is held until a link returns.', since }
  }
  if (meta && isStoredCopy(meta)) {
    return { cause: 'cache', tone: 'info', title: 'Stored copy', detail: CACHE_DETAIL[meta.source] ?? 'Answered without asking the relay.', since }
  }
  if (meta && Date.parse(meta.fetchedAt) < pageLoadedAt) {
    return { cause: 'restored', tone: 'info', title: 'Restored from this device', detail: 'Saved by an earlier visit. The relay is being asked for a fresh copy.', since }
  }
  return null
}
