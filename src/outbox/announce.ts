// What it holds:  announceSyncComplete(): tells every other part of the app that a replay finished, on the "outpost-sw" BroadcastChannel.
// What it means: the page reacts to a `sync-complete` message by refetching the feed and the inbox, recounting the outbox and showing a
//                toast (src/lib/bridge/sw-messages.ts). A replay run by the worker sends that message to the open windows; a replay run by
//                the page's "Retry all now" sends it on the channel, which the page also listens to, so both paths end the same way.
//                `failed` carries every id that was NOT filed (marked failed or still waiting), because the page's toast reads it as
//                "still waiting".
// Caching type:  none.
// Caches touched: none.

import type { ReplayResult } from './replay'
import { SW_BROADCAST_CHANNEL, SYNC_TAG_OUTBOX } from './names'

/** The `sync-complete` message of the contract (shared/sw-protocol.ts) for one run. */
export const syncCompleteMessage = (result: ReplayResult): { type: 'sync-complete'; tag: string; succeeded: string[]; failed: string[] } => ({
  type: 'sync-complete',
  tag: SYNC_TAG_OUTBOX,
  succeeded: result.succeeded,
  failed: [...result.failed, ...result.waiting],
})

/** Posts it on the broadcast channel, when the platform has one. Never throws: a notice that cannot be sent must not fail a replay. */
export function announceSyncComplete(result: ReplayResult): void {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    const channel = new BroadcastChannel(SW_BROADCAST_CHANNEL)
    channel.postMessage(syncCompleteMessage(result))
    channel.close()
  } catch {
    // the other paths (the windows, the recount on focus) still tell the page
  }
}
