// What it holds:  the worker's two push handlers: onPush() answers a `push` event (a message from the server, delivered even with no tab open)
//                 and onNotificationClick() answers a click on a notification this worker showed.
// What it means: Web Push lets the server wake the worker through the browser's push service. The message is a PushPayload
//                (shared/contracts.ts, docs/CONTRACTS.md section 9). Chrome only accepts a subscription made with `userVisibleOnly: true`,
//                which is a promise: every push ends in something the user can see. A worker that shows nothing gets a generic "this site
//                was updated in the background" notification from the browser, unless a window of the site is visible. That is why the two
//                SILENT kinds (silent-badge, sync-poke) exist: they show what happens when the promise is not kept.
// Caching type:  none (a push neither reads nor writes Cache Storage; the only network call is the acknowledge PATCH, never cached).
// Caches touched: none.
//
// onPush, step by step:
//   1. Read the payload with event.data.json(). A push with no data, or data that is not a usable payload, still has to show SOMETHING
//      (the userVisibleOnly promise), so it shows a plain "Outpost" notification instead of failing silently.
//   2. Apply the payload's badgeCount (src/sw/lib/badge.ts): a number sets the app icon badge, 0 clears it, null leaves it alone. This is for
//      every push that carries one, silent or not, and whatever the windows are doing; it never fails the push.
//   3. A SILENT payload shows nothing from here. sync-poke replays the outbox (the same flush as the sync event, src/sw/sync.ts);
//      silent-badge needs nothing more than step 2. Both tell the open windows with `push-received`, which makes the page refetch the inbox.
//   4. Otherwise, if a window is VISIBLE AND FOCUSED, tell it (`push-received`: the page shows a toast with an Open button) and show no system
//      notification, so the person does not get both.
//   5. Otherwise show the notification: title, body, icon, tag (a new push with the same tag replaces the old one), actions,
//      requireInteraction, and in `data` the url, the dispatch id and the kind, so the click handler can read them back.
//   Everything is inside event.waitUntil, because the worker may be stopped before a promise it did not hand over has finished.
//
// onNotificationClick, step by step:
//   1. Close the notification.
//   2. event.action is '' for a click on the body, otherwise the action id ('open', 'ack', anything the sender defined).
//   3. 'ack': PATCH /api/dispatches/<id> with { acked: true } (needs a live session). Done: tell the windows to refetch and stop. A 401, no
//      dispatch id or no network: fall through and open the app instead, so the click never does nothing.
//   4. Anything else opens the notification's url: focus a window that is open and send it a `navigate` message, or openWindow(url) when
//      none is open. openWindow only works inside this event, which is why it is here and not in the push handler.
//   The url is checked here: it must be on this site, otherwise the app's front page is opened.

import type { PushPayload } from '@shared/contracts'
import { applyBadge } from './lib/badge'
import { scope } from './lib/scope'
import { tellPages } from './lib/messages'
import { flush } from './sync'

/** What the notification carries back to the click handler. */
interface NotificationData {
  url: string
  dispatchId: string | null
  kind: string
}

/** What a payload must have to be shown. The server always sends all of it; a message from elsewhere may not. */
function readPayload(event: PushEvent): PushPayload | null {
  let raw: unknown
  try {
    raw = event.data?.json()
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Partial<PushPayload>
  if (typeof p.title !== 'string' || typeof p.body !== 'string') return null
  return {
    v: 1,
    kind: p.kind ?? 'custom',
    title: p.title,
    body: p.body,
    url: typeof p.url === 'string' ? p.url : '/',
    tag: typeof p.tag === 'string' ? p.tag : null,
    dispatchId: typeof p.dispatchId === 'string' ? p.dispatchId : null,
    badgeCount: typeof p.badgeCount === 'number' ? p.badgeCount : null,
    icon: typeof p.icon === 'string' ? p.icon : '/icons/icon-192.png',
    image: typeof p.image === 'string' ? p.image : null,
    actions: Array.isArray(p.actions) ? p.actions.filter((a) => typeof a?.action === 'string' && typeof a.title === 'string').slice(0, 2) : [],
    requireInteraction: p.requireInteraction === true,
    silent: p.silent === true,
    sentAt: typeof p.sentAt === 'string' ? p.sentAt : new Date().toISOString(),
  }
}

/** A URL on this site, as a path: anything else (another origin, a scheme the page would refuse, text that is not a URL) becomes '/'. */
function sitePath(raw: unknown): string {
  try {
    const url = new URL(typeof raw === 'string' ? raw : '/', scope.location.origin)
    return url.origin === scope.location.origin ? `${url.pathname}${url.search}${url.hash}` : '/'
  } catch {
    return '/'
  }
}

/** The windows of this site, controlled or not. */
const openWindows = (): Promise<readonly WindowClient[]> => scope.clients.matchAll({ type: 'window', includeUncontrolled: true })

async function show(payload: PushPayload): Promise<void> {
  const data: NotificationData = { url: sitePath(payload.url), dispatchId: payload.dispatchId, kind: payload.kind }
  // `actions` is part of the notification API but not of TypeScript's worker library, so the options are typed as what they are.
  const options = {
    body: payload.body,
    icon: payload.icon,
    ...(payload.image ? { image: payload.image } : {}),
    ...(payload.tag ? { tag: payload.tag } : {}),
    actions: payload.actions,
    requireInteraction: payload.requireInteraction,
    data,
  } as NotificationOptions
  await scope.registration.showNotification(payload.title, options)
}

/** A silent payload: nothing is shown from here. */
async function handleSilent(payload: PushPayload): Promise<void> {
  if (payload.kind === 'sync-poke') {
    try {
      await flush(false)
    } catch (error) {
      // flush() rejects while something still waits, so that a `sync` event is retried. A push is not retried: the next sync event or the
      // person's "Retry all now" sends it. The rejection must not turn into a failed push handler.
      console.warn('Outpost worker: the sync poke could not send everything', error)
    }
  }
  await tellPages({ type: 'push-received', payload })
}

async function handlePush(event: PushEvent): Promise<void> {
  const payload = readPayload(event)
  if (!payload) {
    // The browser's userVisibleOnly rule: a push that shows nothing is answered with a generic notice, so show a clear one.
    await scope.registration.showNotification('Outpost', { body: 'A message arrived that this version of the app could not read.' })
    return
  }
  // Two writers set this badge: this one, from the payload, and the page, from the unread count it holds. The last write wins.
  await applyBadge(payload.badgeCount)
  if (payload.silent) return handleSilent(payload)

  const focused = (await openWindows()).some((client) => client.focused && client.visibilityState === 'visible')
  if (focused) {
    await tellPages({ type: 'push-received', payload })
    return
  }
  await show(payload)
}

export function onPush(event: PushEvent): void {
  event.waitUntil(handlePush(event))
}

/** The acknowledge action: true when the server took it. A refusal or a network failure is false, and the click then opens the app. */
async function acknowledge(dispatchId: string | null): Promise<boolean> {
  if (!dispatchId) return false
  try {
    const response = await fetch(`/api/dispatches/${encodeURIComponent(dispatchId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acked: true }),
    })
    if (!response.ok) return false
    // The pages refetch what an acknowledge changes: that dispatch and the unread count.
    await tellPages({ type: 'cache-updated', url: `/api/dispatches/${dispatchId}` })
    await tellPages({ type: 'cache-updated', url: '/api/inbox/summary' })
    return true
  } catch {
    return false
  }
}

/** Shows the app at `url`: an open window is focused and told to navigate; with none open a new one is opened. */
async function openApp(url: string): Promise<void> {
  const windows = await openWindows()
  const target = windows.find((client) => client.visibilityState === 'visible') ?? windows[0]
  if (!target) {
    await scope.clients.openWindow(url)
    return
  }
  try {
    await target.focus()
  } catch {
    // a browser that refuses to focus still gets the navigate message
  }
  target.postMessage({ type: 'navigate', url })
}

async function handleClick(event: NotificationEvent): Promise<void> {
  const data = (event.notification.data ?? {}) as Partial<NotificationData>
  const url = sitePath(data.url)
  if (event.action === 'ack' && (await acknowledge(data.dispatchId ?? null))) return
  await openApp(url)
}

export function onNotificationClick(event: NotificationEvent): void {
  event.notification.close()
  event.waitUntil(handleClick(event))
}
