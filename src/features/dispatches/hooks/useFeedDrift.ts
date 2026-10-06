import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { qk, useInbox } from '@/lib/queries'

/** How often the server's feed revision is asked for while the page is open and visible. */
export const DRIFT_POLL_MS = 15_000

export interface FeedDrift {
  /** How many revisions the server is ahead of the list on screen. 0 when they agree, or when either is unknown. */
  behind: number
  /** Throw away the loaded pages and fetch the head of the feed again. */
  refresh(): void
}

/**
 * The visible symptom of React state drifting from server truth. The feed carries the `feedRev` it was fetched at;
 * the inbox summary is polled separately and carries the server's current one. When the server is ahead, something
 * was filed or changed since this list was drawn, and the list will not notice on its own.
 */
export function useFeedDrift(feedRev: number | undefined, settled: boolean): FeedDrift {
  const qc = useQueryClient()
  const { data, refetch } = useInbox()
  const serverRev = data?.feedRev

  useEffect(() => {
    const tick = (): void => {
      if (document.visibilityState === 'visible') void refetch()
    }
    const timer = setInterval(tick, DRIFT_POLL_MS)
    return () => clearInterval(timer)
  }, [refetch])

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.feeds() })
    void qc.invalidateQueries({ queryKey: qk.inbox() })
  }, [qc])

  // While the list itself is being refetched the two numbers are allowed to disagree for a moment.
  const behind = settled && feedRev !== undefined && serverRev !== undefined && serverRev > feedRev ? serverRev - feedRev : 0
  return { behind, refresh }
}
