import type { PwaApi } from './types'

/** The Badging API, which TypeScript's DOM library may not describe and a browser may not have. */
interface BadgeApi {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/** The Badging API as this browser has it, or a `NotSupportedError` ("unsupported" to the app) when it has none. */
function badgeApi(): Required<BadgeApi> {
  const api = (typeof navigator === 'undefined' ? {} : navigator) as BadgeApi
  if (typeof api.setAppBadge !== 'function' || typeof api.clearAppBadge !== 'function') {
    throw new DOMException('This browser has no Badging API. Installed Chromium apps have it.', 'NotSupportedError')
  }
  return api as Required<BadgeApi>
}

/**
 * EXERCISE 13 — Badging API.
 *  - set(n): navigator.setAppBadge(n). 0 clears (the same as clear()). A whole number from 0 up; anything else is a RangeError, so a
 *    caller's bug is not turned into a badge of "NaN". Works in installed PWAs on desktop and Android (a dot); in an ordinary tab the call is
 *    accepted and nothing appears.
 *  - clear(): navigator.clearAppBadge().
 *  - The website calls these from an effect whenever the inbox unread count changes (src/features/inbox/useBadgeSync.ts), quietly: a
 *    failure is in the bridge log, not on screen.
 *  - A SECOND writer exists: the worker sets the badge from a push's badgeCount with no page open (src/sw/lib/badge.ts). The last write
 *    wins and neither knows what the other wrote. That is the mismatch to hunt: React's unread count vs the badge the push handler set
 *    vs GET /api/_lab/truth (Lab -> Consistency, the Inbox page's Badge plate).
 */
export const badge: PwaApi['badge'] = {
  async set(count) {
    if (!Number.isInteger(count) || count < 0) throw new RangeError(`A badge count is a whole number from 0 up, not ${String(count)}.`)
    const api = badgeApi()
    if (count === 0) await api.clearAppBadge()
    else await api.setAppBadge(count)
  },
  async clear() {
    await badgeApi().clearAppBadge()
  },
}
