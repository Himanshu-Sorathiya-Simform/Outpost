import type { DispatchCreate } from '@shared/contracts'
import type { OutboxItem } from '@shared/sw-protocol'
import { announceSyncComplete } from '@/outbox/announce'
import { SYNC_TAG_OUTBOX } from '@/outbox/names'
import { replayOutbox } from '@/outbox/replay'
import { addIfAbsent, list, remove } from '@/outbox/store'
import { setPwa } from './store'
import type { PwaApi } from './types'

/** The part of a registration this file needs. `sync` exists only where Background Sync does (Chromium); Safari and Firefox have none. */
interface SyncCapable {
  sync?: { register(tag: string): Promise<void> }
}

/** Puts the number of records in the store, which the nav pill, the strip and the Drafts page read. A failure leaves the last number. */
export async function refreshQueuedCount(): Promise<OutboxItem[]> {
  const items = await list()
  setPwa({ queuedCount: items.length })
  return items
}

/**
 * Asks the browser to wake the worker with a `sync` event. Everything here is best effort: with no registration, no SyncManager, or a
 * register() that throws, the record is already stored, and "Retry all now" (flushNow) is the way to send it.
 */
async function registerSync(): Promise<void> {
  try {
    const registration = (await navigator.serviceWorker?.getRegistration()) as (ServiceWorkerRegistration & SyncCapable) | undefined
    await registration?.sync?.register(SYNC_TAG_OUTBOX)
  } catch (error) {
    console.warn('Outpost: could not register the background sync; the dispatch stays queued', error)
  }
}

/**
 * EXERCISE 11 — Background Sync (one-off).
 *
 * Flow: submit -> POST /api/dispatches fails with a network-like error -> the page calls queueDispatch() -> the dispatch is a record in the
 * outbox (IndexedDB: src/outbox/store.ts) and the tag "outbox-flush" is registered -> the browser fires `sync` in the worker, which replays
 * the outbox (src/sw/sync.ts, src/outbox/replay.ts: one copy of the rules, shared with flushNow below).
 *
 * Try to break it: Lab -> Chaos -> Presets -> Hard down, Dropped writes, Flaky API, Rate limited; Lab -> Server -> Session control ->
 * Expire now; close the tab while it sends. The server dedupes on the Idempotency-Key (Lab -> Network shows `idempotent-replay`).
 */
export const sync: PwaApi['sync'] = {
  async queueDispatch(input: DispatchCreate): Promise<OutboxItem> {
    const item: OutboxItem = {
      id: input.clientId,
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'queued',
      lastError: null,
      // The record stores the dispatch as the server will read it, with the schema's defaults filled in.
      payload: { ...input, tags: input.tags ?? [], coords: input.coords ?? null },
    }
    // The same dispatch twice (a double click) is one record, and a record that is being sent is not reset.
    const stored = await addIfAbsent(item)
    await refreshQueuedCount()
    await registerSync()
    return stored
  },

  async listQueued() {
    return refreshQueuedCount()
  },

  async removeQueued(id) {
    await remove(id)
    await refreshQueuedCount()
  },

  /**
   * "Retry all now": replays every record, the failed ones too (a person asked, for example after clocking in again), from the page. It
   * takes the same lock as the worker's sync event and sends the same Idempotency-Key, so the two cannot file a dispatch twice.
   * The result is announced on the broadcast channel like the worker does it, so the toast, the refetch and the recount are the same.
   */
  async flushNow() {
    const result = await replayOutbox(['queued', 'sending', 'failed'])
    await refreshQueuedCount()
    if (result.succeeded.length > 0 || result.failed.length > 0 || result.waiting.length > 0) announceSyncComplete(result)
  },
}
