/**
 * Cache surgery for dispatches. One dispatch lives in several places at once: its detail query, every cached page
 * of every feed (one infinite query per filter set), and it is counted in the inbox summary. An optimistic write
 * has to touch all of them or the screens disagree with each other, which is the exact failure Lab -> Consistency
 * is built to show. These helpers are the only code that knows that layout.
 */
import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query'
import type { Dispatch, DispatchPage, DispatchPatch, InboxSummary } from '@shared/contracts'
import type { ApiResult, ResponseMeta } from '@/lib/api/types'
import { qk } from './keys'

export type FeedData = InfiniteData<ApiResult<DispatchPage>, string | undefined>

/** Raw copies of cached query data, keyed so they can be put back verbatim. */
export type CacheSnapshot = ReadonlyArray<readonly [QueryKey, unknown]>

/** Copies the current data of every query under each prefix. Queries that have no data yet are skipped on restore. */
export function snapshotCaches(qc: QueryClient, ...prefixes: QueryKey[]): CacheSnapshot {
  return prefixes.flatMap((queryKey) => qc.getQueriesData({ queryKey }))
}

export function restoreCaches(qc: QueryClient, snapshot: CacheSnapshot): void {
  for (const [key, data] of snapshot) {
    if (data !== undefined) qc.setQueryData(key, data)
  }
}

/** The server's validator for a dispatch, as it builds it: W/"<id>-r<rev>". */
export const dispatchEtag = (d: Pick<Dispatch, 'id' | 'rev'>): string => `W/"${d.id}-r${d.rev}"`

/**
 * The newest copy of a dispatch any cache holds (highest rev). The detail query and the feed pages are fetched at
 * different moments, so they can disagree; the highest revision is the best guess at what the server has.
 */
export function findCachedDispatch(qc: QueryClient, id: string): Dispatch | undefined {
  let best = qc.getQueryData<ApiResult<Dispatch>>(qk.dispatch(id))?.data
  for (const [, feed] of qc.getQueriesData<FeedData>({ queryKey: qk.feeds() })) {
    for (const page of feed?.pages ?? []) {
      for (const item of page.data.items) {
        if (item.id === id && (best === undefined || item.rev > best.rev)) best = item
      }
    }
  }
  return best
}

function withPatch(d: Dispatch, patch: DispatchPatch): Dispatch {
  // Not a spread: a patch may carry explicit `undefined` keys, which must not erase a field.
  return { ...d, read: patch.read ?? d.read, acked: patch.acked ?? d.acked, starred: patch.starred ?? d.starred }
}

/** Marking a dispatch read (or unread) moves the inbox counters; urgent and critical also move urgentUnread. */
export function inboxAfterReadChange(summary: InboxSummary, before: Pick<Dispatch, 'read' | 'severity'>, read: boolean): InboxSummary {
  if (before.read === read) return summary
  const step = read ? -1 : 1
  const urgent = before.severity === 'urgent' || before.severity === 'critical'
  return {
    ...summary,
    unread: Math.max(0, summary.unread + step),
    urgentUnread: urgent ? Math.max(0, summary.urgentUnread + step) : summary.urgentUnread,
  }
}

function mapFeedItems(qc: QueryClient, fn: (items: Dispatch[]) => Dispatch[]): void {
  qc.setQueriesData<FeedData>({ queryKey: qk.feeds() }, (old) => old && { ...old, pages: old.pages.map((page) => ({ ...page, data: { ...page.data, items: fn(page.data.items) } })) })
}

/**
 * Applies a patch to the detail query, to the item in every cached feed page that contains it, and to the inbox
 * counters. Deliberately leaves `rev` alone: it belongs to the server, and If-Match must still carry the revision
 * the user actually saw. An item that stops matching a feed's filter (read, in an unread-only feed) stays where it
 * is until the feed revalidates, so the list does not jump under the user's finger.
 */
export function applyOptimisticPatch(qc: QueryClient, id: string, patch: DispatchPatch): void {
  const before = findCachedDispatch(qc, id)

  qc.setQueryData<ApiResult<Dispatch>>(qk.dispatch(id), (old) => old && { ...old, data: withPatch(old.data, patch) })
  mapFeedItems(qc, (items) => items.map((d) => (d.id === id ? withPatch(d, patch) : d)))

  if (before && patch.read !== undefined) {
    const read = patch.read
    qc.setQueryData<ApiResult<InboxSummary>>(qk.inbox(), (old) => old && { ...old, data: inboxAfterReadChange(old.data, before, read) })
  }
}

/** Optimistic "mark all read": every cached dispatch reads as read and the inbox shows zero. */
export function applyOptimisticReadAll(qc: QueryClient): void {
  const read = (d: Dispatch): Dispatch => (d.read ? d : { ...d, read: true })
  mapFeedItems(qc, (items) => items.map(read))
  qc.setQueriesData<ApiResult<Dispatch>>({ queryKey: qk.details() }, (old) => old && { ...old, data: read(old.data) })
  qc.setQueryData<ApiResult<InboxSummary>>(qk.inbox(), (old) => old && { ...old, data: { ...old.data, unread: 0, urgentUnread: 0 } })
}

/**
 * Writes what the server says a dispatch is into every place it is cached. With `meta` (a real response) the
 * detail query is created or replaced whole; without it (the `current` copy inside a 412 body) an existing detail
 * keeps its old meta and a missing one is not invented, since there is no response to describe.
 */
export function storeDispatch(qc: QueryClient, dispatch: Dispatch, meta?: ResponseMeta): void {
  if (meta) qc.setQueryData<ApiResult<Dispatch>>(qk.dispatch(dispatch.id), { data: dispatch, meta })
  else qc.setQueryData<ApiResult<Dispatch>>(qk.dispatch(dispatch.id), (old) => old && { ...old, data: dispatch })
  mapFeedItems(qc, (items) => items.map((d) => (d.id === dispatch.id ? dispatch : d)))
}
