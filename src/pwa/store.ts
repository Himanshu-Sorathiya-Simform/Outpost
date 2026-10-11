import { create } from 'zustand'
import type { PermissionState } from './types'

/**
 * Reactive PWA state the website renders (update toast, install card, status strip, settings).
 * YOU write to it from src/pwa/*; the UI only reads. Field names are the contract — values are yours.
 */
export interface PwaState {
  /** Whether this page has a service worker registration. Written by src/pwa/registration.ts from what the browser reports (mirror()). */
  swRegistered: boolean
  /** Free text shown in the status strip: 'installing' | 'waiting' | 'active' | 'redundant' | 'error' ... */
  swState: string
  /** A new worker is waiting behind the one that controls this page. Derived in registration.ts mirror() (a waiting worker AND a controller), never set by an event. Shows the "Update ready" toast. */
  updateAvailable: boolean
  /** A deferred beforeinstallprompt is stashed. Enables the Install button. */
  installPromptAvailable: boolean
  /** Running as an installed app. Initialised from display-mode; listens for changes. */
  standalone: boolean
  /** The browser's notification permission; written by notifications.requestPermission() and read again on focus. */
  notificationPermission: PermissionState
  /** Whether the browser has a push subscription. Written by subscribePush / unsubscribePush / getSubscription, and read at boot. */
  pushSubscribed: boolean
  /** Records in the IndexedDB outbox (src/outbox/): queued, sending and failed. Kept equal by src/pwa/sync.ts after every change, and read at boot. Shown as a pill in the nav and the Drafts page. */
  queuedCount: number
  /** Tags the browser reports as registered for periodic sync (getTags()). Written by src/pwa/periodic-sync.ts after every call, and read at boot. */
  periodicTags: string[]
}

export const usePwaStore = create<PwaState>()(() => ({
  swRegistered: false,
  swState: 'none',
  updateAvailable: false,
  installPromptAvailable: false,
  standalone: typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches,
  notificationPermission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  pushSubscribed: false,
  queuedCount: 0,
  periodicTags: [],
}))

export function setPwa(patch: Partial<PwaState>): void {
  usePwaStore.setState(patch)
}

if (typeof matchMedia === 'function') {
  matchMedia('(display-mode: standalone)').addEventListener('change', (e) => setPwa({ standalone: e.matches }))
}
