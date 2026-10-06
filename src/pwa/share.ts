import { notImplemented } from './errors'
import type { PwaApi } from './types'

/**
 * EXERCISE — Web Share + Web Share Target.
 *  - share(): navigator.share({ title, text, url, files? }). Map AbortError → 'cancelled'. Needs a user gesture + HTTPS/localhost.
 *    Feature-detect with navigator.canShare; Firefox desktop has neither, return 'unsupported' and let the UI fall back to copy-link.
 *  - Used by the Share button on every dispatch (src/features/dispatches) and on handbook chapters.
 *  - Share TARGET (receiving): add share_target to your manifest pointing at /share-target (GET params title, text, url).
 *    The page /share-target already exists and turns incoming shares into a prefilled draft.
 *    POST targets need your service worker to intercept the form post and redirect.
 */
export const share: PwaApi['share'] = {
  canShare(_data) {
    return false
  },
  async share(_data) {
    return notImplemented('share.share', 'navigator.share(data)')
  },
}
