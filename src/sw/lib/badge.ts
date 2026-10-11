// What it holds:  applyBadge(): the worker's way of setting the app icon badge from a push's `badgeCount`.
// What it means: the Badging API lets an installed app show a number on its icon, and it exists on the worker's own `navigator`, so a push can
//                update it with no window open. A number above 0 sets it, 0 clears it, and `null` means "leave the badge alone" (the contract in
//                shared/contracts.ts, PushPayload.badgeCount). The page ALSO sets the badge, from the unread count React holds
//                (src/pwa/badge.ts, useBadgeSync): two writers, one badge, last write wins, and neither knows what the other wrote. That is the
//                mismatch exercise 13 is about. The OS badge cannot be read, so every decision is also posted to the open windows as a `log`
//                message (Lab -> Worker -> Message log), the only way to see what the worker did.
// Caching type:  none.
// Caches touched: none.
//
// What it does: validate the number (a whole number from 0 up, else ignored), call setAppBadge or clearAppBadge when the API is there, and
// say what happened. It NEVER throws: a failing badge must not fail the push that carried it (the notification, the toast and the outbox
// replay still happen).

import { tellPages } from './messages'
import { scope } from './scope'

/** The Badging API on a worker's navigator. TypeScript's worker library may not describe it, and a browser may not have it. */
interface WorkerBadge {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/** Applies a push's badgeCount and logs the decision for the pages. */
export async function applyBadge(count: number | null): Promise<void> {
  if (count === null) {
    await tellPages({ type: 'log', level: 'info', message: 'Badge: the push said to leave it alone (badgeCount null).' })
    return
  }
  if (!Number.isInteger(count) || count < 0) {
    await tellPages({ type: 'log', level: 'warn', message: `Badge: ignored a badgeCount of ${String(count)}; it must be a whole number from 0 up.` })
    return
  }
  const api = scope.navigator as unknown as WorkerBadge
  if (typeof api.setAppBadge !== 'function' || typeof api.clearAppBadge !== 'function') {
    await tellPages({ type: 'log', level: 'warn', message: 'Badge: this browser has no Badging API in the worker, so the badge was not changed.' })
    return
  }
  try {
    if (count === 0) await api.clearAppBadge()
    else await api.setAppBadge(count)
    await tellPages({ type: 'log', level: 'info', message: count === 0 ? 'Badge cleared by a push.' : `Badge set to ${count} by a push.` })
  } catch (error) {
    console.warn('Outpost worker: could not change the badge', error)
    await tellPages({ type: 'log', level: 'warn', message: `Badge: the browser refused to set ${count}.` })
  }
}
