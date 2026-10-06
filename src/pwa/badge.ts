import { notImplemented } from './errors'
import type { PwaApi } from './types'

/**
 * EXERCISE — Badging API.
 *  - set(n): navigator.setAppBadge(n) (n === 0 clears it). Works in installed PWAs on desktop + Android (as a dot);
 *    setAppBadge also exists on the SW global scope, so a push handler can update it with no window open.
 *  - The website calls badge.set(unreadCount) from an effect whenever the inbox summary changes
 *    (src/features/inbox/useBadgeSync.ts). Failures are logged to Lab → Queue & Bridge, never shown as errors.
 *  - Mismatch to hunt: React Query's unread count vs the badge your push handler set vs GET /api/_lab/truth.
 */
export const badge: PwaApi['badge'] = {
  async set(_count) {
    notImplemented('badge.set', 'navigator.setAppBadge(count)')
  },
  async clear() {
    notImplemented('badge.clear', 'navigator.clearAppBadge()')
  },
}
