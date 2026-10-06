import type { DispatchCreate } from '@shared/contracts'
import type { OutboxItem } from '@shared/sw-protocol'

export type PermissionState = NotificationPermission | 'unsupported'

export interface ShareInput {
  title?: string
  text?: string
  url?: string
  files?: File[]
}
export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported'
export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

/**
 * The surface the website calls into. Every method is a stub that rejects with
 * PwaNotImplementedError until you write it. The website never calls navigator.serviceWorker,
 * Notification, PushManager, SyncManager, navigator.setAppBadge or navigator.share directly —
 * only these seams do. That is what keeps your learning code in one place.
 *
 * Where each one is used in the UI is documented in the file that implements it.
 */
export interface PwaApi {
  registration: {
    /** Register your service worker. Called from boot(). */
    register(): Promise<void>
    unregister(): Promise<boolean>
    /** registration.update() — "Check for update" button in Settings and Lab → Service Worker. */
    checkForUpdate(): Promise<void>
    /** Tell the waiting worker to take over and reload when controllerchange fires. Wired to the "Update" toast. */
    applyUpdate(): Promise<void>
  }
  install: {
    /** Show the deferred beforeinstallprompt. */
    prompt(): Promise<InstallOutcome>
  }
  notifications: {
    permission(): PermissionState
    requestPermission(): Promise<PermissionState>
    /** Subscribe via PushManager using GET /api/push/vapid, then POST /api/push/subscribe. */
    subscribePush(): Promise<PushSubscriptionJSON>
    unsubscribePush(): Promise<void>
    getSubscription(): Promise<PushSubscriptionJSON | null>
    /** registration.showNotification — "Local test" button, no server involved. */
    showLocal(title: string, options?: NotificationOptions): Promise<void>
  }
  sync: {
    /** Persist the dispatch (IndexedDB) and register the one-off Background Sync. Called when a submit fails with a network error. */
    queueDispatch(input: DispatchCreate): Promise<OutboxItem>
    listQueued(): Promise<OutboxItem[]>
    removeQueued(id: string): Promise<void>
    /** Manual "retry now" for browsers without SyncManager (and for impatience). */
    flushNow(): Promise<void>
  }
  periodicSync: {
    isSupported(): boolean
    register(tag: string, minIntervalMs: number): Promise<void>
    unregister(tag: string): Promise<void>
    list(): Promise<string[]>
  }
  badge: {
    /** navigator.setAppBadge. The app calls this automatically whenever the unread count changes. */
    set(count: number): Promise<void>
    clear(): Promise<void>
  }
  share: {
    canShare(data: ShareInput): boolean
    share(data: ShareInput): Promise<ShareOutcome>
  }
}
