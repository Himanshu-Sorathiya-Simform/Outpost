import type { BenchStrategy, DispatchFilters } from '@shared/contracts'

/** Everything GET /api/dispatches accepts except the cursor, which belongs to the page, not to the list. */
export type FeedFilters = Omit<DispatchFilters, 'cursor'>

/**
 * The canonical form of a filter set: empty strings and `undefined` are dropped so that "no filter" always
 * produces the same key. `false` is kept: `unread: false` means "only read dispatches", which is a real filter.
 */
export function normalizeFeedFilters(filters: FeedFilters): FeedFilters {
  const out: FeedFilters = {}
  if (filters.severity !== undefined) out.severity = filters.severity
  if (filters.station) out.station = filters.station
  const q = filters.q?.trim()
  if (q) out.q = q
  if (filters.unread !== undefined) out.unread = filters.unread
  if (filters.starred !== undefined) out.starred = filters.starred
  if (filters.limit !== undefined) out.limit = filters.limit
  return out
}

/**
 * The query key factory. Keys are hierarchical so one prefix reaches a whole family:
 *
 *   qk.dispatches()  every feed page and every detail
 *   qk.feeds()       every feed, whatever its filters
 *   qk.lab.all()     every lab instrument (never persisted)
 *
 * Two roots carry meaning outside this file: 'session' (tab sync invalidates it when another tab clocks in or out)
 * and 'lab' (the persister refuses to write either to disk).
 */
export const qk = {
  session: () => ['session'] as const,

  dispatches: () => ['dispatches'] as const,
  feeds: () => ['dispatches', 'feed'] as const,
  feed: (filters: FeedFilters = {}) => ['dispatches', 'feed', normalizeFeedFilters(filters)] as const,
  details: () => ['dispatches', 'detail'] as const,
  dispatch: (id: string) => ['dispatches', 'detail', id] as const,

  inbox: () => ['inbox'] as const,
  digests: () => ['digest'] as const,
  digest: (since: string | null = null) => ['digest', since] as const,

  stations: () => ['stations'] as const,
  stationList: () => ['stations', 'list'] as const,
  station: (code: string) => ['stations', 'detail', code] as const,

  signal: () => ['signal'] as const,

  handbook: () => ['handbook'] as const,
  handbookIndex: () => ['handbook', 'index'] as const,
  handbookChapter: (slug: string) => ['handbook', 'chapter', slug] as const,

  benchAll: () => ['bench'] as const,
  bench: (strategy: BenchStrategy, key: string) => ['bench', strategy, key] as const,

  push: {
    vapid: () => ['push', 'vapid'] as const,
    subscriptions: () => ['push', 'subscriptions'] as const,
  },

  lab: {
    all: () => ['lab'] as const,
    state: () => ['lab', 'state'] as const,
    truth: () => ['lab', 'truth'] as const,
  },
} as const
