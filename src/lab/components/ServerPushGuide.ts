import type { PresetId } from './ServerPushDraft'

export interface PresetGuide {
  title: string
  steps: string[]
}

/** What the learner's `push` handler is expected to do for each kind of push. */
export const PUSH_GUIDE: Record<PresetId, PresetGuide> = {
  dispatch: {
    title: 'A new dispatch',
    steps: [
      'Read the payload with event.data.json() inside event.waitUntil().',
      'Call registration.showNotification(title, { body, tag, icon, actions, requireInteraction, data: { url } }).',
      'Apply badgeCount with navigator.setAppBadge in the worker, when it is not null.',
      'In notificationclick, focus an open window and postMessage a navigate message, or clients.openWindow(url).',
      'Optional: if a window is focused, send push-received to it instead of showing a system notification.',
    ],
  },
  custom: {
    title: 'A custom notification',
    steps: ['Show it exactly as sent: title and body come only from the payload.', 'A tag replaces an earlier notification with the same tag instead of stacking a second one.', 'notificationclick opens payload.url, which is /log unless you changed it.'],
  },
  'silent-badge': {
    title: 'A silent badge update',
    steps: [
      'Do not call showNotification: payload.silent is true.',
      'Call navigator.setAppBadge(badgeCount), or clearAppBadge() at 0.',
      'Chrome requires a visible notification for every push when the subscription says userVisibleOnly. A worker that shows nothing gets a generic "This site has been updated in the background" one. This kind is how you meet that rule.',
    ],
  },
  'sync-poke': {
    title: 'A sync poke',
    steps: ['No notification. Treat the push as a reason to fetch: replay the outbox, refresh GET /api/digest, update the caches.', 'When done, postMessage sync-complete or periodic-sync-complete so open windows refresh.', 'The same userVisibleOnly caveat as the silent badge applies.'],
  },
  'long-running': {
    title: 'A notification that stays',
    steps: ['Pass requireInteraction: true through to showNotification. Desktop Chrome then keeps it until dismissed; Android ignores the flag.', 'Close it yourself in notificationclick with event.notification.close().', 'A high urgency and a long TTL make the push service try harder to reach a sleeping device.'],
  },
  actions: {
    title: 'A notification with buttons',
    steps: ['Pass payload.actions to showNotification. Chrome shows at most two.', 'In notificationclick, read event.action: an empty string is a click on the body, otherwise it is the action id.', 'Give each id its own result: open navigates, ack could PATCH the dispatch and needs a session.'],
  },
}
