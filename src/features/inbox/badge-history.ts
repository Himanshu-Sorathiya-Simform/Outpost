import { useEffect } from 'react'
import { create } from 'zustand'
import type { BridgeLogEntry } from '@/lib/bridge/seam'

const KEEP = 40

export interface UnreadSample {
  /** Epoch ms. */
  at: number
  unread: number
}

interface UnreadSamples {
  /** Newest first. */
  samples: UnreadSample[]
  note(unread: number): void
}

/**
 * The bridge log records that `badge.set` was called, not with which number. The value is always the unread count
 * at that moment (useBadgeSync), so the page keeps its own short history of the count and looks the value up by time.
 * It only knows what happened while this page was open.
 */
export const useUnreadSamples = create<UnreadSamples>((set) => ({
  samples: [],
  note: (unread) =>
    set((s) => (s.samples[0]?.unread === unread ? s : { samples: [{ at: Date.now(), unread }, ...s.samples].slice(0, KEEP) })),
}))

/** Feeds the history. `undefined` (count not loaded yet) records nothing. */
export function useRecordUnread(unread: number | undefined): void {
  useEffect(() => {
    if (unread !== undefined) useUnreadSamples.getState().note(unread)
  }, [unread])
}

export const isBadgeEntry = (entry: BridgeLogEntry): boolean => entry.feature === 'badge.set' || entry.feature === 'badge.clear'

/** What the app asked the OS badge to show in this call: 0 for a clear, else the unread count when it started. `null` when unknown. */
export function requestedBadgeValue(entry: BridgeLogEntry, samples: UnreadSample[]): number | null {
  if (entry.feature === 'badge.clear') return 0
  const started = entry.at - entry.durationMs
  return samples.find((s) => s.at <= started)?.unread ?? null
}
