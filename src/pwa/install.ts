import { notImplemented } from './errors'
import type { PwaApi } from './types'

/**
 * EXERCISE — installability.
 *  - Add a web app manifest (+ <link rel="manifest"> in index.html). Icons are already in public/icons (once the
 *    design pass has produced them) — you write the manifest.
 *  - Listen for `beforeinstallprompt` (early! before React mounts — boot.ts is a good place), stash the event,
 *    setPwa({ installPromptAvailable: true }).
 *  - prompt(): event.prompt() → await userChoice → map to 'accepted' | 'dismissed'.
 *  - Listen for `appinstalled`.
 *
 * Used by: Settings → Install card, and the shell's install nudge.
 * Not available on iOS Safari / Firefox desktop: return 'unavailable' and let the UI explain.
 */
export const install: PwaApi['install'] = {
  async prompt() {
    return notImplemented('install.prompt', 'stash beforeinstallprompt and call prompt()')
  },
}
