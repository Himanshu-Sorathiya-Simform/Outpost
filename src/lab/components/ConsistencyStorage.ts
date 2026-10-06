import { z } from 'zod'
import { API, Dispatch, DispatchPage, HDR, InboxSummary } from '@shared/contracts'
import { dispatchFacts, inboxFacts, type DispatchFacts, type InboxFacts, type Reading } from './ConsistencyModel'

/** What Cache Storage holds for one URL. Reading only: caches.match and a cloned body, never a write. */
export type StorageCopy<T> = { kind: 'hit'; value: T; at: number | null } | { kind: 'miss' } | { kind: 'unreadable'; why: string }

export type StorageSnapshot =
  | { status: 'unavailable'; note: string }
  | {
      status: 'ready'
      inbox: StorageCopy<InboxFacts>
      dispatches: Record<string, StorageCopy<DispatchFacts>>
    }

/** The clock the copy carries: the server's X-Served-At (the data's age), else the worker's own stamp. */
function copyTime(response: Response): number | null {
  for (const name of [HDR.servedAt, HDR.swCachedAt]) {
    const raw = response.headers.get(name)
    const t = raw ? Date.parse(raw) : NaN
    if (Number.isFinite(t)) return t
  }
  return null
}

async function readCopy<S extends z.ZodType>(url: string, schema: S, options?: CacheQueryOptions): Promise<StorageCopy<z.output<S>>> {
  let response: Response | undefined
  try {
    response = await caches.match(url, options)
  } catch (thrown) {
    return { kind: 'unreadable', why: thrown instanceof Error ? thrown.message : 'caches.match failed' }
  }
  if (!response) return { kind: 'miss' }
  if (response.type === 'opaque') return { kind: 'unreadable', why: 'opaque response: its body cannot be read' }
  let json: unknown
  try {
    json = await response.clone().json()
  } catch {
    return { kind: 'unreadable', why: 'the stored body is not valid JSON' }
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) return { kind: 'unreadable', why: 'the stored body does not match the contract (an old build, or schema drift)' }
  return { kind: 'hit', value: parsed.data, at: copyTime(response) }
}

const mapCopy = <A, B>(copy: StorageCopy<A>, fn: (value: A) => B): StorageCopy<B> => (copy.kind === 'hit' ? { ...copy, value: fn(copy.value) } : copy)

/** /api/inbox/summary, /api/dispatches (for its feedRev, matched under any query string) and one /api/dispatches/<id> per row, all read in parallel and independently. */
export async function readStorageLayer(ids: readonly string[]): Promise<StorageSnapshot> {
  if (typeof caches === 'undefined') return { status: 'unavailable', note: 'Cache Storage needs a secure context (https or localhost).' }
  const [summary, feed, ...details] = await Promise.all([
    readCopy(API.inbox, InboxSummary),
    readCopy(API.dispatches, DispatchPage, { ignoreSearch: true }),
    ...ids.map((id) => readCopy(API.dispatch(id), Dispatch)),
  ])
  const feedRev = feed.kind === 'hit' ? feed.value.feedRev : null
  // The inbox summary and the feed are two different URLs with two different copies; their feedRevs both belong to this layer.
  const inbox: StorageCopy<InboxFacts> =
    summary.kind === 'hit'
      ? { kind: 'hit', value: inboxFacts(summary.value, feedRev), at: summary.at }
      : feed.kind === 'hit'
        ? { kind: 'hit', value: { unread: null, urgent: null, inboxRev: null, feedRev }, at: feed.at }
        : summary.kind === 'unreadable'
          ? summary
          : feed.kind === 'unreadable'
            ? feed
            : { kind: 'miss' }
  // A learner who caches only the feed list never stores /api/dispatches/<id>: fall back to the item inside the cached page.
  const fromFeed = (id: string): StorageCopy<DispatchFacts> => {
    const item = feed.kind === 'hit' ? feed.value.items.find((d) => d.id === id) : undefined
    return feed.kind === 'hit' && item ? { kind: 'hit', value: dispatchFacts(item), at: feed.at } : { kind: 'miss' }
  }
  return {
    status: 'ready',
    inbox,
    dispatches: Object.fromEntries(
      ids.map((id, i) => {
        const copy = details[i] ? mapCopy(details[i], dispatchFacts) : ({ kind: 'miss' } as const)
        return [id, copy.kind === 'miss' ? fromFeed(id) : copy]
      }),
    ),
  }
}

/** One copy as a layer reading: a miss is an empty layer (nothing stored), not an error. */
export function storageReading<T>(snapshot: StorageSnapshot | null, pick: (ready: Extract<StorageSnapshot, { status: 'ready' }>) => StorageCopy<T> | undefined): Reading<T> {
  if (snapshot === null) return { status: 'pending' }
  if (snapshot.status === 'unavailable') return { status: 'unavailable', note: snapshot.note }
  const copy = pick(snapshot)
  if (!copy || copy.kind === 'miss') return { status: 'empty', note: 'Not in Cache Storage. No worker has stored it.' }
  if (copy.kind === 'unreadable') return { status: 'unavailable', note: copy.why }
  return { status: 'ok', value: copy.value, at: copy.at }
}
