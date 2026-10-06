import { notImplemented } from './errors'
import type { PwaApi } from './types'

/**
 * EXERCISE — notifications + Web Push.
 *  - permission()/requestPermission(): Notification API. Only ask from a user gesture.
 *  - subscribePush(): registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
 *    with the key from GET /api/push/vapid, then POST the JSON to /api/push/subscribe (API.pushSubscribe).
 *  - In your SW: `push` event → event.data.json() is a PushPayload (shared/contracts.ts).
 *    silent kinds ('silent-badge', 'sync-poke') must not call showNotification... and on Chrome you'll
 *    learn why that rule exists (userVisibleOnly).
 *  - `notificationclick` → focus an open window and postMessage({ type: 'navigate', url }) or openWindow(url).
 *  - Send pushes from Lab → Server → Push console.
 *
 * Used by: Settings → Notifications card, Lab → Server.
 */
export const notifications: PwaApi['notifications'] = {
  permission() {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  },
  async requestPermission() {
    return notImplemented('notifications.requestPermission', 'Notification.requestPermission()')
  },
  async subscribePush() {
    return notImplemented('notifications.subscribePush', 'pushManager.subscribe + POST /api/push/subscribe')
  },
  async unsubscribePush() {
    notImplemented('notifications.unsubscribePush')
  },
  async getSubscription() {
    return notImplemented('notifications.getSubscription', 'registration.pushManager.getSubscription()')
  },
  async showLocal(_title, _options) {
    notImplemented('notifications.showLocal', 'registration.showNotification()')
  },
}
