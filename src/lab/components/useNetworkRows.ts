import { useEffect, useMemo, useState } from 'react'
import { SERVER_LOG_RING_SIZE, getTabId, useLabFeed, useNetLog, type FeedStatus } from '@/lib'
import type { NetLogEntry } from '@/lib/api/net-log'
import type { RequestLogEntry } from '@shared/contracts'
import { joinLogs, nextPendingExpiry, type JoinedRow } from './NetworkJoin'
import { useNetworkSession } from './NetworkSession'

export interface NetworkData {
  rows: JoinedRow[]
  client: NetLogEntry[]
  server: RequestLogEntry[]
  feed: FeedStatus
}

/**
 * Both logs, joined. Re-joins when either log changes, and once more when the freshest client entry has waited
 * long enough for its server twin to show up on the live feed (until then it reads NO VERDICT, not CACHE).
 */
export function useNetworkData(): NetworkData {
  const feed = useLabFeed()
  const client = useNetLog((s) => s.entries)
  const clearedAt = useNetworkSession((s) => s.serverClearedAt)
  const [now, setNow] = useState(0)
  const feedOpen = feed.status === 'open'

  useEffect(() => {
    setNow(Date.now())
  }, [])

  const rows = useMemo(
    () => joinLogs(client, feed.serverLog, { tabId: getTabId(), now, feedOpen, clearedAt, pageStart: performance.timeOrigin, ringSize: SERVER_LOG_RING_SIZE }),
    [client, feed.serverLog, now, feedOpen, clearedAt],
  )

  const expiry = nextPendingExpiry(rows, now)
  useEffect(() => {
    if (expiry === null) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(40, expiry - Date.now() + 40))
    return () => clearTimeout(timer)
  }, [expiry])

  return { rows, client, server: feed.serverLog, feed: feed.status }
}

export interface Tail {
  shown: JoinedRow[]
  live: boolean
  /** Rows that arrived after the tail was paused. */
  pendingCount: number
  pause(): void
  resume(): void
}

/** Live tail: follows the joined log, or freezes the view so a row can be read without sliding away. */
export function useTail(rows: JoinedRow[]): Tail {
  const [frozen, setFrozen] = useState<JoinedRow[] | null>(null)
  const pendingCount = useMemo(() => {
    if (!frozen) return 0
    const known = new Set(frozen.map((r) => r.key))
    return rows.filter((r) => !known.has(r.key)).length
  }, [frozen, rows])
  return { shown: frozen ?? rows, live: frozen === null, pendingCount, pause: () => setFrozen(rows), resume: () => setFrozen(null) }
}
