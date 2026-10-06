import type { QueryClient } from '@tanstack/react-query'
import type { Dispatch } from '@shared/contracts'
import type { ResponseMeta } from '@/lib/api/types'
import { flattenFeed, qk, type FeedData } from '@/lib/queries'
import { parseLogFilters, toFeedFilters } from '../filters'

export interface ListedCopy {
  dispatch: Dispatch
  /** Provenance of the list page the copy came from. */
  meta: ResponseMeta
}

/** The newest copy of a dispatch that any cached list page holds, with the meta of the page that held it. */
export function findListedCopy(qc: QueryClient, id: string): ListedCopy | undefined {
  let best: ListedCopy | undefined
  for (const [, feed] of qc.getQueriesData<FeedData>({ queryKey: qk.feeds() })) {
    for (const page of feed?.pages ?? []) {
      for (const item of page.data.items) {
        if (item.id === id && (best === undefined || item.rev > best.dispatch.rev)) best = { dispatch: item, meta: page.meta }
      }
    }
  }
  return best
}

export interface Neighbours {
  /** Filed after this one. */
  newer: Dispatch | undefined
  /** Filed before this one. */
  older: Dispatch | undefined
}

/**
 * The entries on either side of a dispatch in the list the operator came from (its filters travel in the link
 * state), else in the unfiltered log. Only what is already cached: nothing is fetched to find a neighbour.
 */
export function findNeighbours(qc: QueryClient, id: string, logSearch: string): Neighbours | null {
  const keys = [qk.feed(toFeedFilters(parseLogFilters(new URLSearchParams(logSearch)))), qk.feed({})]
  for (const key of keys) {
    const list = flattenFeed(qc.getQueryData<FeedData>(key))
    const at = list.findIndex((d) => d.id === id)
    if (at >= 0) return { newer: list[at - 1], older: list[at + 1] }
  }
  return null
}
