// What it holds:  everything the worker says to the pages (tellPages) and everything the pages say to the worker (onMessage).
// What it means: a worker and a page are separate programs that talk by posting messages. The shapes of the messages are fixed by
//                shared/sw-protocol.ts, which the page validates and logs (Lab -> Worker -> Message log). tellPages() is how every part of
//                the worker speaks: "cache-updated" (a stored copy changed, refetch: stale-while-revalidate, an acknowledged dispatch),
//                "log" (a line for the worker log: cleanup, clear-caches, badge decisions, failed background refreshes), "sw-version" (the
//                reply to "get-version"), "sync-complete" (the outbox replay, src/sw/sync.ts), "push-received" and "navigate" (push.ts) and
//                "periodic-sync-complete" (periodic-sync.ts). onMessage() understands "get-version", "skip-waiting" and "clear-caches" from
//                the page. The contract's "prefetch" and "ping" are not handled (nothing sends prefetch, and ping needs no answer here); a
//                message of any other type is ignored.
// Caching type:  none.
// Caches touched: none directly (the version reply lists the bucket names that exist; clear-caches deletes buckets through caching/cleanup.ts).

import type { SwToPage } from '@shared/sw-protocol'
import { BUILD_ID } from '../build-info'
import { clearOurs } from '../caching/cleanup'
import { scope } from './scope'

/** Sends a message to every open window, controlled or not. It never throws: a failed notice must not break what called it. */
export async function tellPages(message: SwToPage): Promise<void> {
  try {
    const windows = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) client.postMessage(message)
  } catch (error) {
    console.warn('Outpost worker: could not message the pages', error)
  }
}

/** Tells whoever asked which build this worker is and which caches it holds. */
async function replyWithVersion(source: ExtendableMessageEvent['source']): Promise<void> {
  const names = await caches.keys()
  if (source) source.postMessage({ type: 'sw-version', version: BUILD_ID, caches: names } satisfies SwToPage)
}

/**
 * Lab -> Worker -> Actions -> "Send clear-caches". Deletes our buckets (all of them, or those whose name starts with `prefix`), and says in
 * the worker log what it deleted, or that nothing matched. Buckets that are not ours are never touched. A prefix that is not a string
 * is treated as a malformed message and ignored.
 */
async function clearCaches(prefix: string | undefined): Promise<void> {
  try {
    const deleted = await clearOurs(prefix)
    const scopeText = prefix === undefined ? 'every cache of ours' : `our caches starting with "${prefix}"`
    const message = deleted.length > 0 ? `clear-caches: deleted ${deleted.join(', ')}.` : `clear-caches: nothing to delete among ${scopeText}.`
    await tellPages({ type: 'log', level: 'info', message })
  } catch (error) {
    console.warn('Outpost worker: could not clear the caches', error)
    await tellPages({ type: 'log', level: 'error', message: 'clear-caches: the caches could not be cleared.' })
  }
}

/**
 * "skip-waiting": the page pressed Update. A worker that is waiting takes over now (it activates, which deletes the outdated buckets and
 * claims the tabs; every controlled tab then reloads). The page must send it to registration.waiting: sent to the controller, which is the
 * old worker, it does nothing, because skipWaiting() on a worker that is already active has no effect (Lab -> Worker -> Send skip-waiting).
 */
async function takeOver(): Promise<void> {
  await scope.skipWaiting()
}

/** Every other message is ignored. */
export function onMessage(event: ExtendableMessageEvent): void {
  const data = event.data as { type?: unknown; prefix?: unknown } | null
  if (!data) return
  if (data.type === 'get-version') event.waitUntil(replyWithVersion(event.source))
  else if (data.type === 'skip-waiting') event.waitUntil(takeOver())
  else if (data.type === 'clear-caches' && (data.prefix === undefined || typeof data.prefix === 'string')) event.waitUntil(clearCaches(data.prefix))
}
