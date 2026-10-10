// What it holds:  everything the worker says to the pages (tellPages) and everything the pages say to the worker (onMessage).
// What it means: a worker and a page are separate programs that talk by posting messages. The shapes of the messages are fixed by
//                shared/sw-protocol.ts, which the page validates and logs (Lab -> Worker -> Message log). The worker sends
//                "cache-updated" (a stored copy changed, refetch), "log" (a line for the worker log) and "sw-version" (the reply to
//                "get-version"). It understands "get-version" from the page; the other page-to-worker messages are for later exercises.
// Caching type:  none.
// Caches touched: none directly (the version reply lists the bucket names that exist).

import type { SwToPage } from '@shared/sw-protocol'
import { BUILD_ID } from '../build-info'
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

/** Lab -> Worker -> Actions -> "Send get-version": tells two worker versions apart, which a script URL cannot. Every other message is ignored. */
export function onMessage(event: ExtendableMessageEvent): void {
  const data = event.data as { type?: unknown } | null
  if (!data || data.type !== 'get-version') return
  event.waitUntil(replyWithVersion(event.source))
}
