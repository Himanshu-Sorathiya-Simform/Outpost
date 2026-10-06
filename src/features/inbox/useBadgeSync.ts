import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { callSeam } from '@/lib/bridge/seam'
import { inboxQueryOptions } from '@/lib/queries/inbox'
import { pwa } from '@/pwa'

/** Long enough that a burst of optimistic patches (triage by tapping down a list) produces one badge write, not ten. */
export const BADGE_DEBOUNCE_MS = 300

/**
 * The unread count from the inbox summary, shared with useInbox (same query, one request). `undefined` until the
 * first summary has arrived, so callers can tell "zero" from "not known yet".
 */
export function useUnreadCount(): number | undefined {
  return useQuery({ ...inboxQueryOptions(), select: (result) => result.data.unread }).data
}

/**
 * Keeps the app badge equal to the unread count. Mount it once, high in the tree (the app shell).
 *
 * Each change is debounced by 300 ms; a value equal to the one last sent is skipped; 0 clears the badge instead of
 * setting it. It calls the badge seam quietly, so while src/pwa/badge.ts is a stub (or the browser has no Badging
 * API) nothing is shown to the user. Every attempt, including the stubbed ones, is listed in Lab -> Queue & Bridge.
 */
export function useBadgeSync(): void {
  const unread = useUnreadCount()
  const lastSent = useRef<number | null>(null)

  useEffect(() => {
    if (unread === undefined || unread === lastSent.current) return
    const timer = setTimeout(() => {
      lastSent.current = unread
      const call = unread > 0 ? callSeam('badge.set', () => pwa.badge.set(unread), { quiet: true }) : callSeam('badge.clear', () => pwa.badge.clear(), { quiet: true })
      // A real failure is already in the bridge log and the error centre; the next change simply tries again.
      call.catch(() => undefined)
    }, BADGE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [unread])
}
