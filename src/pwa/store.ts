import { create } from 'zustand'
import type { PermissionState } from './types'

/**
 * Reactive PWA state the website renders (update toast, install card, status strip, settings).
 * YOU write to it from src/pwa/*; the UI only reads. Field names are the contract — values are yours.
 */
export interface PwaState {
  /** Set true in boot() if 'serviceWorker' in navigator and you registered. */
  swRegistered: boolean
  /** Free text shown in the status strip: 'installing' | 'waiting' | 'active' | 'redundant' | 'error' ... */
  swState: string
  /** A new worker is waiting. Shows the "Update ready" toast. */
  updateAvailable: boolean
  /** A deferred beforeinstallprompt is stashed. Enables the Install button. */
  installPromptAvailable: boolean
  /** Running as an installed app. Initialised from display-mode; listens for changes. */
  standalone: boolean
  notificationPermission: PermissionState
  pushSubscribed: boolean
  /** Items waiting in the IndexedDB outbox. Shown as a pill in the nav and the Drafts page. */
  queuedCount: number
  /** Tags currently registered for periodic sync. */
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
