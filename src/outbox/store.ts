// What it holds:  the outbox in IndexedDB: database "outpost-outbox", object store "outbox", one record per queued dispatch, keyed by `id`.
//                 addIfAbsent(), list(), save(), remove() and markFailed().
// What it means: the outbox is what is left to send. A record is an OutboxItem (shared/sw-protocol.ts): the dispatch itself (`payload`),
//                its `id` (equal to payload.clientId, which is also the Idempotency-Key), how many tries it had (`attempts`), where it stands
//                (`status`: queued, sending or failed) and why the last try did not work (`lastError`). IndexedDB is used because both the page
//                and the worker can open it, and it outlives the tab: a dispatch queued now is still there after a reload, a crash or a
//                closed browser. This file runs in the page and in the worker, so it uses only APIs both have.
// Caching type:  none (this is not Cache Storage; nothing here is a copy of something the server has).
// Caches touched: none.

import type { OutboxItem } from '@shared/sw-protocol'
import { OUTBOX_DB, OUTBOX_STORE } from './names'

type Mode = 'readonly' | 'readwrite'

/** Resolves with the database, creating the store on first use. The connection is closed by whoever opened it (see `inStore`). */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTBOX_DB, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(OUTBOX_STORE)) request.result.createObjectStore(OUTBOX_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('The outbox database could not be opened'))
    request.onblocked = () => reject(new Error('The outbox database is blocked by another connection'))
  })
}

/**
 * Runs `work` inside one transaction and resolves with what it returned, once the transaction has COMMITTED (not when the request
 * succeeded: a request can succeed and its transaction still abort). The connection is closed afterwards, so a worker that stops between
 * jobs holds nothing open.
 */
async function inStore<T>(mode: Mode, work: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(OUTBOX_STORE, mode)
      let result: T
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => reject(transaction.error ?? new Error('The outbox transaction failed'))
      transaction.onabort = () => reject(transaction.error ?? new Error('The outbox transaction was aborted'))
      work(transaction.objectStore(OUTBOX_STORE), (value) => {
        result = value
      })
    })
  } finally {
    database.close()
  }
}

/**
 * Stores a new item, unless one with the same id exists, and returns the one that is stored. The same dispatch queued twice (a double
 * click, a retry of the submit) is therefore one record, and a record that is being sent is not reset to `queued` by the second call.
 */
export function addIfAbsent(item: OutboxItem): Promise<OutboxItem> {
  return inStore<OutboxItem>('readwrite', (store, done) => {
    const existing = store.get(item.id)
    existing.onsuccess = () => {
      if (existing.result) return done(existing.result as OutboxItem)
      store.add(item)
      done(item)
    }
  })
}

/** Every record, the oldest first (ISO strings sort as time). */
export async function list(): Promise<OutboxItem[]> {
  const items = await inStore<OutboxItem[]>('readonly', (store, done) => {
    const all = store.getAll()
    all.onsuccess = () => done(all.result as OutboxItem[])
  })
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Writes the record as it is now (replacing the stored one). */
export function save(item: OutboxItem): Promise<void> {
  return inStore<void>('readwrite', (store, done) => {
    store.put(item)
    done()
  })
}

/** Deletes one record. A missing id is not an error. */
export function remove(id: string): Promise<void> {
  return inStore<void>('readwrite', (store, done) => {
    store.delete(id)
    done()
  })
}

/** Marks these records `failed` with a reason, in one transaction, keeping their payload. Records that are gone are skipped. */
export function markFailed(ids: readonly string[], lastError: string): Promise<void> {
  return inStore<void>('readwrite', (store, done) => {
    for (const id of ids) {
      const read = store.get(id)
      read.onsuccess = () => {
        if (read.result) store.put({ ...(read.result as OutboxItem), status: 'failed', lastError })
      }
    }
    done()
  })
}
