import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import type { InboxSummary } from '@shared/contracts'
import type { ApiResult } from '@/lib/api/types'
import { useBridgeLog, type BridgeLogEntry, type SeamOutcome } from '@/lib/bridge/seam'
import { qk } from '@/lib/queries'
import type { BadgeInfo } from './ConsistencyModel'

/**
 * The bridge log says that badge.set was called, not with what. useBadgeSync always sends the unread count React holds,
 * so each new call is stamped with React's unread at the moment it appears here. Calls made before this page was open
 * cannot be stamped that way: their value is React's count now, which is a guess, and the table says so.
 */
interface Stamp {
  value: number
  exact: boolean
}

interface StampStore {
  stamps: Record<number, Stamp>
  stamp(id: number, stamp: Stamp): void
}

const useStamps = create<StampStore>((set) => ({ stamps: {}, stamp: (id, stamp) => set((s) => ({ stamps: { ...s.stamps, [id]: stamp } })) }))

const isBadgeCall = (e: BridgeLogEntry): boolean => e.feature === 'badge.set' || e.feature === 'badge.clear'

export interface BadgeAsked {
  /** What the app last asked the badge to show. */
  value: number
  /** false when the number is inferred rather than observed. */
  exact: boolean
  at: number
  outcome: SeamOutcome
  feature: string
}

/** The app's last badge request, and the facts the diagnosis needs about it. */
export function useBadgeAsked(): { asked: BadgeAsked | null; info: BadgeInfo } {
  const qc = useQueryClient()
  const entries = useBridgeLog((s) => s.entries)
  const stamps = useStamps((s) => s.stamps)
  const stamp = useStamps((s) => s.stamp)

  // Calls with a higher id than this one happened while the page was open.
  const [baseline] = useState(() => useBridgeLog.getState().entries.find(isBadgeCall)?.id ?? 0)
  const latest = entries.find(isBadgeCall)
  const latestId = latest?.id
  const latestFeature = latest?.feature
  useEffect(() => {
    if (latestId === undefined || useStamps.getState().stamps[latestId]) return
    const unread = qc.getQueryData<ApiResult<InboxSummary>>(qk.inbox())?.data.unread
    stamp(latestId, { value: latestFeature === 'badge.clear' ? 0 : (unread ?? 0), exact: latestId > baseline })
  }, [latestId, latestFeature, baseline, qc, stamp])

  if (!latest) return { asked: null, info: { outcome: null } }
  const known = stamps[latest.id]
  const guess = latest.feature === 'badge.clear' ? 0 : (qc.getQueryData<ApiResult<InboxSummary>>(qk.inbox())?.data.unread ?? 0)
  return {
    asked: { value: known?.value ?? guess, exact: known?.exact ?? false, at: latest.at, outcome: latest.outcome, feature: latest.feature },
    info: { outcome: latest.outcome },
  }
}
