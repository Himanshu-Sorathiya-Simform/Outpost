import type { PushSubscribeRequest } from '@shared/contracts'
import * as endpoints from '@/lib/queries/endpoints'
import { findRegistration } from './registration'
import { setPwa } from './store'
import type { PwaApi } from './types'

/** The VAPID key arrives as base64url text; `subscribe()` wants bytes (some browsers refuse the string). */
function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** The registration, or a clear error: push needs a registered worker, and subscribing needs it to be active. */
async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || typeof PushManager === 'undefined') {
    throw new DOMException('This browser has no push support.', 'NotSupportedError')
  }
  const registration = await findRegistration()
  if (!registration?.active) throw new DOMException('No active service worker, so there is nothing to receive a push.', 'InvalidStateError')
  return registration
}

/**
 * EXERCISE 12 — notifications + Web Push.
 *
 * Flow: Settings -> Notifications -> Enable alerts (a click, because permission can only be asked from a user gesture) ->
 * requestPermission() -> subscribePush(): the server's VAPID key becomes bytes, pushManager.subscribe({ userVisibleOnly: true,
 * applicationServerKey }) makes the browser subscription, and POST /api/push/subscribe tells the server about it. The server then sends
 * pushes (Lab -> Server -> Push console), the browser wakes the worker, and src/sw/push.ts shows the notification and handles the click.
 *
 * Try to break it: block notifications in the browser's site settings (the step reads denied, not failed); remove the row from the
 * console's Subscriptions table and send (attempted 0: removing it there does not unsubscribe the browser); send to one subscription.
 */
export const notifications: PwaApi['notifications'] = {
  permission() {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  },

  async requestPermission() {
    if (typeof Notification === 'undefined') throw new DOMException('This browser has no Notification API.', 'NotSupportedError')
    const answer = await Notification.requestPermission()
    setPwa({ notificationPermission: answer })
    return answer
  },

  async subscribePush() {
    const registration = await activeRegistration()
    const before = await registration.pushManager.getSubscription()
    const { data: vapid } = await endpoints.getPushVapid()
    // userVisibleOnly is a promise that every push shows something; Chrome rejects a subscription without it.
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapid.publicKey) })
    const json = subscription.toJSON()
    try {
      await endpoints.subscribePush({ subscription: json } as PushSubscribeRequest)
    } catch (error) {
      // A subscription only the browser knows about would receive nothing and look subscribed. Undo what this call made.
      if (!before) await subscription.unsubscribe().catch(() => false)
      throw error
    }
    setPwa({ pushSubscribed: true, notificationPermission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission })
    return json
  },

  async unsubscribePush() {
    const registration = await findRegistration()
    const subscription = (await registration?.pushManager?.getSubscription()) ?? null
    if (subscription) {
      const { endpoint } = subscription
      await subscription.unsubscribe()
      setPwa({ pushSubscribed: false })
      // Idempotent on the server: an endpoint it no longer has is answered `removed: false`.
      await endpoints.unsubscribePush({ endpoint })
    } else {
      setPwa({ pushSubscribed: false })
    }
  },

  async getSubscription() {
    const registration = await findRegistration()
    const subscription = (await registration?.pushManager?.getSubscription()) ?? null
    setPwa({ pushSubscribed: subscription !== null })
    return subscription ? subscription.toJSON() : null
  },

  async showLocal(title, options) {
    const registration = await findRegistration()
    if (!registration) throw new DOMException('No service worker is registered, so there is nothing to show a notification.', 'InvalidStateError')
    await registration.showNotification(title, options)
  },
}
