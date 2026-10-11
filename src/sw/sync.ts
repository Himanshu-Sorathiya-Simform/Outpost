// What it holds:  the worker's `sync` handler: onSync() answers the Background Sync event with tag "outbox-flush" by replaying the outbox.
// What it means: Background Sync lets the page say "send this later" (src/pwa/sync.ts registers the tag) and the BROWSER wakes the worker once
//                it thinks the link is back, even if no tab is open. The worker replays the outbox (src/outbox/replay.ts) and keeps the
//                event alive with waitUntil until that is done. If the promise REJECTS, the browser schedules another `sync` with its own
//                backoff; `event.lastChance` says no more are coming, so what is still waiting is marked `failed` and the promise resolves.
//                The worker never answers the page's POST itself (fetch.ts ignores every non-GET): the page's own request fails, the page
//                queues it, and only this handler sends it later.
// Caching type:  none (the outbox is IndexedDB, not Cache Storage).
// Caches touched: none.
//
// What it does, step by step:
//   1. Ignore a tag that is not "outbox-flush".
//   2. Replay the records that are `queued` (or `sending`, a leftover of a run that died) and collect { succeeded, failed, waiting }.
//   3. If something is still waiting and this is the LAST CHANCE: mark those records `failed` ("Gave up after N tries: ...") so nothing loops
//      or disappears silently, and count them as failed.
//   4. Tell the pages (`sync-complete`, to every window and on the "outpost-sw" channel).
//   5. If something is still waiting (and it was not the last chance), REJECT, so the browser retries. Otherwise resolve.

import { announceSyncComplete, syncCompleteMessage } from '../outbox/announce'
import { SYNC_TAG_OUTBOX } from '../outbox/names'
import { replayOutbox, type ReplayResult } from '../outbox/replay'
import { list, markFailed } from '../outbox/store'
import { tellPages } from './lib/messages'

/** The Background Sync event. TypeScript's worker library does not describe it yet. */
export interface SyncEvent extends ExtendableEvent {
  readonly tag: string
  readonly lastChance: boolean
}

/** What a last-chance run does to the records still waiting: marks them failed, with the reason the last try left behind. */
async function giveUp(result: ReplayResult): Promise<ReplayResult> {
  const stored = new Map((await list()).map((item) => [item.id, item]))
  for (const id of result.waiting) {
    const item = stored.get(id)
    const why = item?.lastError ? `: ${item.lastError}` : ''
    await markFailed([id], `Gave up after ${item?.attempts ?? 0} tries${why}`)
  }
  return { ...result, failed: [...result.failed, ...result.waiting], waiting: [] }
}

/**
 * Replays, tells the pages, and decides whether the browser should try again: it REJECTS while something still waits. The sync event hands
 * that rejection to the browser; a `sync-poke` push (src/sw/push.ts) catches it.
 */
export async function flush(lastChance: boolean): Promise<void> {
  let result = await replayOutbox(['queued', 'sending'])
  const retryLater = result.waiting.length > 0 && !lastChance
  if (result.waiting.length > 0 && lastChance) result = await giveUp(result)

  if (result.succeeded.length > 0 || result.failed.length > 0 || result.waiting.length > 0) {
    await tellPages(syncCompleteMessage(result))
    announceSyncComplete(result)
  }
  if (retryLater) throw new Error(`${result.waiting.length} dispatch${result.waiting.length === 1 ? '' : 'es'} still waiting; the browser will retry`)
}

/** The `sync` listener's body. */
export function onSync(event: SyncEvent): void {
  if (event.tag !== SYNC_TAG_OUTBOX) return
  event.waitUntil(flush(event.lastChance))
}
