import { notImplemented } from './errors'
import type { PwaApi } from './types'

/**
 * EXERCISE — Background Sync (one-off).
 *
 * Flow the website already follows (src/features/compose):
 *   submit → POST /api/dispatches fails with a *network* AppError → app calls sync.queueDispatch(input)
 *   → UI shows the dispatch as "queued" (Drafts → Outbox) → your SW replays it on the `sync` event.
 *
 * What you write:
 *  - queueDispatch(): put an OutboxItem (shared/sw-protocol.ts) into IndexedDB (OUTBOX_DB / OUTBOX_STORE),
 *    then registration.sync.register(SYNC_TAG_OUTBOX). Fall back gracefully when SyncManager is missing
 *    (Safari, Firefox): the item stays queued and flushNow() is the user's retry button.
 *  - SW `sync` handler: read the outbox, POST each item with the Idempotency-Key header = item.id,
 *    delete on 2xx (a replayed Idempotency-Key answers 200, not 409), back off on 429/5xx, drop or mark 'failed' on 400/422.
 *    Finish with postMessage({ type: 'sync-complete', ... }) to all clients.
 *
 * Break it: Lab → Chaos → "Flaky 30%", "Hard down", "Rate limit", and close the tab mid-queue.
 * The server dedupes on Idempotency-Key — watch Lab → Network for `idempotent-replay`.
 */
export const sync: PwaApi['sync'] = {
  async queueDispatch(_input) {
    return notImplemented('sync.queueDispatch', 'write to IndexedDB + registration.sync.register(SYNC_TAG_OUTBOX)')
  },
  async listQueued() {
    return notImplemented('sync.listQueued', 'read the outbox store')
  },
  async removeQueued(_id) {
    notImplemented('sync.removeQueued')
  },
  async flushNow() {
    notImplemented('sync.flushNow', 'replay the outbox from the page')
  },
}
