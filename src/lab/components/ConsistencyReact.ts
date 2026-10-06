import { useEffect, useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { Dispatch, InboxSummary } from '@shared/contracts'
import type { ApiResult } from '@/lib/api/types'
import { qk, type FeedData } from '@/lib/queries'
import { dispatchFacts, inboxFacts, type DispatchFacts, type InboxFacts, type ReactDiag, type Reading } from './ConsistencyModel'

/** How many dispatches Table 2 lists. */
export const DISPATCH_ROWS = 12
/** Query cache events arrive in bursts while a refetch runs; one redraw per burst is enough. */
const COALESCE_MS = 200

/** Re-renders the caller when anything in the query cache changes. Reading the cache directly is the point: no observer is mounted. */
export function useQueryCacheVersion(qc: QueryClient): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = qc.getQueryCache().subscribe(() => {
      timer ??= setTimeout(() => {
        timer = undefined
        setVersion((v) => v + 1)
      }, COALESCE_MS)
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [qc])
  return version
}

interface FeedEntry {
  data: FeedData
  updatedAt: number
  unfiltered: boolean
}

/** Every cached feed (one per filter set) that has data, the unfiltered one first, then newest first. */
function cachedFeeds(qc: QueryClient): FeedEntry[] {
  return qc
    .getQueryCache()
    .findAll({ queryKey: qk.feeds() })
    .flatMap((q) => {
      const data = q.state.data as FeedData | undefined
      const filters: unknown = q.queryKey[2]
      const unfiltered = typeof filters === 'object' && filters !== null && Object.keys(filters).length === 0
      return data ? [{ data, updatedAt: q.state.dataUpdatedAt, unfiltered }] : []
    })
    .sort((a, b) => Number(b.unfiltered) - Number(a.unfiltered) || b.updatedAt - a.updatedAt)
}

export interface ReactInbox {
  reading: Reading<InboxFacts>
  diag: ReactDiag | null
}

/** unread/urgent/feedRev as React Query holds them: the inbox summary and page 0 of the preferred feed. */
export function readReactInbox(qc: QueryClient): ReactInbox {
  const inboxState = qc.getQueryState<ApiResult<InboxSummary>>(qk.inbox())
  const summary = inboxState?.data?.data
  const feed = cachedFeeds(qc)[0]
  const feedRev = feed?.data.pages[0]?.data.feedRev ?? null

  if (!summary && !feed) {
    return { reading: { status: 'empty', note: 'Nothing cached. Open the Inbox or the Log in this tab first.' }, diag: null }
  }
  const facts: InboxFacts = summary ? inboxFacts(summary, feedRev) : { unread: null, urgent: null, inboxRev: null, feedRev }
  const stamps = [inboxState?.data ? inboxState.dataUpdatedAt : null, feed ? feed.updatedAt : null].filter((t): t is number => t !== null)
  return {
    reading: { status: 'ok', value: facts, at: Math.min(...stamps) },
    diag: inboxState ? { error: inboxState.error, paused: inboxState.fetchStatus === 'paused' } : null,
  }
}

export interface ReactDispatch {
  id: string
  title: string
  /** The copy React would show: the detail query's when it is at least as new as the feed's. */
  best: DispatchFacts
  /** Set when React's own two copies disagree. */
  feed: DispatchFacts
  detail: DispatchFacts | null
  splitBrain: boolean
  updatedAt: number
}

/** The first dispatches found in React's feed cache, with every copy of each (feed page item and detail query). */
export function readReactDispatches(qc: QueryClient, limit = DISPATCH_ROWS): ReactDispatch[] {
  const newest = new Map<string, { item: Dispatch; updatedAt: number }>()
  const order: string[] = []
  for (const feed of cachedFeeds(qc)) {
    for (const page of feed.data.pages) {
      for (const item of page.data.items) {
        const known = newest.get(item.id)
        if (!known) order.push(item.id)
        if (!known || item.rev > known.item.rev) newest.set(item.id, { item, updatedAt: feed.updatedAt })
      }
    }
  }
  return order.slice(0, limit).flatMap((id) => {
    const entry = newest.get(id)
    if (!entry) return []
    const detailState = qc.getQueryState<ApiResult<Dispatch>>(qk.dispatch(id))
    const detail = detailState?.data?.data
    const feedFacts = dispatchFacts(entry.item)
    const detailFacts = detail ? dispatchFacts(detail) : null
    const useDetail = detailFacts !== null && detail !== undefined && detail.rev >= entry.item.rev
    const best = useDetail && detailFacts ? detailFacts : feedFacts
    const splitBrain = detailFacts !== null && (detailFacts.rev !== feedFacts.rev || detailFacts.read !== feedFacts.read || detailFacts.acked !== feedFacts.acked || detailFacts.starred !== feedFacts.starred)
    return [{ id, title: entry.item.title, best, feed: feedFacts, detail: detailFacts, splitBrain, updatedAt: Math.max(entry.updatedAt, detailState?.dataUpdatedAt ?? 0) }]
  })
}
