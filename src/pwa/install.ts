import { setPwa } from './store'
import type { InstallOutcome, PwaApi } from './types'

/** Chrome's install prompt event. TypeScript's DOM library does not describe it, and Safari and Firefox never fire it. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** The prompt the browser offered, kept until the person asks for it. An event can be used once, so it is dropped the moment it has been. */
let stashed: BeforeInstallPromptEvent | null = null
/** True while the install dialog is open: a second press must not call prompt() on the same event again. */
let prompting = false

/**
 * Asks the browser not to evict this site's storage (the caches, the outbox, the drafts) when the disk fills up. Without it the storage is "best
 * effort" and can vanish whole. Called once an install has happened, the moment a browser is most willing to say yes (Chrome usually grants it to an
 * installed app by itself). The answer changes nothing the page does, so it is not tracked, and a browser without it, or one that refuses, is ignored.
 * The Lab shows the result: Lab -> Environment -> Storage, "Persisted".
 */
async function keepStorage(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.storage?.persist === 'function') await navigator.storage.persist()
  } catch {
    // nothing to do: the storage simply stays best effort
  }
}

/*
 * These listeners are attached when this module LOADS, not in an effect and not in boot() after an await: `beforeinstallprompt` can fire before
 * React has mounted, and an event nobody was listening for is gone. src/pwa/index.ts imports this file, and the app imports src/pwa at start.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Without preventDefault() the browser shows its own mini-infobar and the page cannot choose the moment.
    event.preventDefault()
    stashed = event as BeforeInstallPromptEvent
    setPwa({ installPromptAvailable: true })
  })
  window.addEventListener('appinstalled', () => {
    // Installed by any route (our button, the address bar, the browser menu): the stashed prompt is no use any more.
    stashed = null
    setPwa({ installPromptAvailable: false })
    void keepStorage()
  })
}

/**
 * EXERCISE 16 — installability. The manifest is public/manifest.webmanifest (linked from index.html); this file is the install BUTTON.
 *  - The browser decides when the app is installable (a manifest that passes, a secure origin, and its own engagement rules). It then fires
 *    `beforeinstallprompt`, which is stashed above and shown as "Install prompt stored: yes" in Settings -> Install.
 *  - prompt(): 'unavailable' when nothing is stashed (Safari, Firefox, already installed, or the browser has not decided yet). Otherwise
 *    event.prompt(), then the person's answer: 'accepted' or 'dismissed'. The event is dropped once the dialog has been shown, so Install app
 *    is disabled until the browser offers a new one. Called outside a click the browser refuses; that error is thrown and the prompt stays stashed.
 *  - After an install the page keeps running in its tab; `display-mode: standalone` only becomes true in the installed window.
 *  - Exercise 17: on `appinstalled` the page also asks for persistent storage once (keepStorage above), so a full disk is less likely to evict the caches and the outbox.
 *
 * Used by: Settings -> Install card, and the shell's install nudge.
 */
export const install: PwaApi['install'] = {
  async prompt(): Promise<InstallOutcome> {
    const event = stashed
    if (!event || prompting) return 'unavailable'
    prompting = true
    try {
      await event.prompt()
      // The dialog has been shown: this event cannot be used again, whatever the answer.
      stashed = null
      setPwa({ installPromptAvailable: false })
      const choice = await event.userChoice
      return choice.outcome
    } finally {
      prompting = false
    }
  },
}
