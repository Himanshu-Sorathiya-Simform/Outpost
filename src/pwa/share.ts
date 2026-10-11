import type { PwaApi } from './types'

/**
 * EXERCISE 15 — Web Share (sharing OUT of the app).
 *  - canShare(data): navigator.canShare(data) when the browser has it, else false. A payload the browser rejects, or a canShare that throws, is false
 *    too: this is a question the UI asks to decide between "Share" and "Copy link", so it must never throw.
 *  - share(data): navigator.share(data). 'unsupported' when the browser has no navigator.share (Firefox desktop, Chrome on Linux), 'cancelled' when
 *    the person closes the share sheet (the browser's AbortError), 'shared' otherwise. Every other error is a real failure and goes through
 *    unchanged: a NotAllowedError (called outside a click) must not be reported as "cancelled".
 *  - navigator.share needs a user gesture and a secure context. The call is made before any await, so the gesture is still fresh.
 *  - Used by the Share button on every dispatch (src/features/dispatches/hooks/useShareDispatch.ts) and on handbook chapters
 *    (src/features/handbook/shareChapter.ts), which fall back to copying the link on 'unsupported' and on any failure.
 *  - Receiving shares (a share target) is a manifest feature: exercise 16 (public/manifest.webmanifest, the /share-target page).
 */
export const share: PwaApi['share'] = {
  canShare(data) {
    if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false
    try {
      return navigator.canShare(data)
    } catch {
      return false
    }
  },

  async share(data) {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unsupported'
    try {
      await navigator.share(data)
      return 'shared'
    } catch (error) {
      // AbortError is the person closing the sheet. It is the only error that means "cancelled".
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
      throw error
    }
  },
}
