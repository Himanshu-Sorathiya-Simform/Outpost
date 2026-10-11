// What it holds:  the REPLAY of the outbox: replayOutbox() reads the queued dispatches and POSTs each to /api/dispatches, then judges each
//                 answer (classify()) and updates or deletes the record. It is the one place that knows what an answer means for an item.
// What it means: a dispatch that could not be sent waits in the outbox (store.ts). Replaying it is safe to repeat because every POST carries
//                `Idempotency-Key: <id>`: if an earlier try reached the server but its answer was lost, the server answers 200 with
//                `Idempotent-Replay: true` and the same dispatch, and no second one is made. The page's "Retry all now" (src/pwa/sync.ts)
//                and the worker's `sync` event (src/sw/sync.ts) both call this file, so there is one copy of the rules.
// Caching type:  none (nothing is stored in Cache Storage; the records are in IndexedDB).
// Caches touched: none.
//
// What one run does, step by step:
//   1. Take the lock "outpost-outbox-flush" (Web Locks), so a second replayer waits and then finds nothing left. Without Web Locks the run
//      goes ahead anyway, and the idempotency key keeps it safe.
//   2. Read the records whose status is one the caller asked for, oldest first.
//   3. For each one: write `status: 'sending'` and `attempts + 1` to the record BEFORE the POST, so a run that dies leaves an honest record.
//   4. POST it: Content-Type application/json, Idempotency-Key = id, body = JSON of the payload, the session cookie sent by the browser.
//   5. Judge the answer:
//        201, or 200 + Idempotent-Replay, with a JSON body      delete the record                        -> succeeded
//        401, 403, 400, 422 and any other 4xx but 408 and 429    status failed, lastError = the server's message  -> failed
//        429                                                     back to queued, lastError names the wait  -> waiting, run stops
//        5xx, 408, an unexpected 2xx, a body that is not JSON    back to queued, lastError says what       -> waiting
//        fetch() rejects (offline, dropped)                      back to queued, lastError says so         -> waiting, run stops
//   6. Report { succeeded, failed, waiting }. A run that stops (offline, rate limited) leaves the rest untouched and counts them as waiting.

import type { OutboxItem } from '@shared/sw-protocol'
import { OUTBOX_LOCK } from './names'
import { list, remove, save } from './store'

export type OutboxStatus = OutboxItem['status']

/** Where the dispatch is filed. The one URL the outbox ever sends to. */
const DISPATCHES_URL = '/api/dispatches'

export interface ReplayResult {
  /** Ids the server now has (created, or already had). Their records are deleted. */
  succeeded: string[]
  /** Ids this run marked `failed`: the server will never accept them as they are. The records stay, with the reason. */
  failed: string[]
  /** Ids still `queued`: they were not sent, or the try did not work and may later. */
  waiting: string[]
  /** Why the run stopped before the end, if it did. */
  stoppedBecause: 'offline' | 'rate-limited' | null
}

/** What one answer means for one item. */
type Verdict =
  | { kind: 'sent' }
  | { kind: 'rejected'; message: string }
  | { kind: 'retry'; message: string; stop?: 'rate-limited'; retryAfterSeconds?: number }

/** The server's own words for a refusal ({ error: { message } }), or the status when the body says nothing usable. */
async function messageOf(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } }
    return typeof body.error?.message === 'string' && body.error.message !== '' ? body.error.message : fallback
  } catch {
    return fallback
  }
}

/** Seconds from a Retry-After header, or null when it is missing or is not a plain number of seconds. */
function retryAfterOf(response: Response): number | null {
  const seconds = Number(response.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

/** Turns one answer into a verdict. A 2xx counts as success only when it is the documented one AND its body is JSON. */
export async function classify(response: Response): Promise<Verdict> {
  const { status } = response
  if (status === 201 || (status === 200 && response.headers.get('idempotent-replay') === 'true')) {
    try {
      await response.json()
      return { kind: 'sent' }
    } catch {
      return { kind: 'retry', message: `The server answered ${status} but the body was not JSON, so it was not counted as filed.` }
    }
  }
  if (status === 429) {
    const seconds = retryAfterOf(response)
    return { kind: 'retry', stop: 'rate-limited', retryAfterSeconds: seconds ?? undefined, message: seconds ? `Rate limited: the server asked to wait ${seconds} s.` : 'Rate limited by the server.' }
  }
  if (status === 401) return { kind: 'rejected', message: await messageOf(response, 'Not signed in. Clock in, then retry.') }
  if (status >= 400 && status < 500 && status !== 408) return { kind: 'rejected', message: await messageOf(response, `The server refused it (${status}).`) }
  if (status >= 200 && status < 300) return { kind: 'retry', message: `The server answered ${status}, not 201 or a replay, so it was not counted as filed.` }
  return { kind: 'retry', message: `The server answered ${status}.` }
}

/** Runs `work` while holding the outbox lock; where Web Locks do not exist, simply runs it. */
async function underLock(work: () => Promise<ReplayResult>): Promise<ReplayResult> {
  if (typeof navigator === 'undefined' || !navigator.locks) return work()
  return await navigator.locks.request(OUTBOX_LOCK, () => work())
}

/**
 * Replays every record whose status is in `statuses`. The worker's sync event passes ['queued', 'sending'] (a `sending` record under the
 * lock is a leftover from a run that died); the page's "Retry all now" passes all three, because a person asked.
 */
export function replayOutbox(statuses: readonly OutboxStatus[]): Promise<ReplayResult> {
  return underLock(() => run(statuses))
}

async function run(statuses: readonly OutboxStatus[]): Promise<ReplayResult> {
  const result: ReplayResult = { succeeded: [], failed: [], waiting: [], stoppedBecause: null }
  const todo = (await list()).filter((item) => statuses.includes(item.status))

  for (const [index, item] of todo.entries()) {
    const sending: OutboxItem = { ...item, status: 'sending', attempts: item.attempts + 1 }
    await save(sending)

    let verdict: Verdict
    try {
      const response = await fetch(DISPATCHES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': item.id },
        body: JSON.stringify(item.payload),
      })
      verdict = await classify(response)
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      await save({ ...sending, status: 'queued', lastError: `The network did not answer (${why}).` })
      result.waiting.push(item.id, ...todo.slice(index + 1).map((rest) => rest.id))
      result.stoppedBecause = 'offline'
      return result
    }

    if (verdict.kind === 'sent') {
      await remove(item.id)
      result.succeeded.push(item.id)
    } else if (verdict.kind === 'rejected') {
      await save({ ...sending, status: 'failed', lastError: verdict.message })
      result.failed.push(item.id)
    } else {
      await save({ ...sending, status: 'queued', lastError: verdict.message })
      result.waiting.push(item.id)
      if (verdict.stop) {
        result.waiting.push(...todo.slice(index + 1).map((rest) => rest.id))
        result.stoppedBecause = verdict.stop
        return result
      }
    }
  }
  return result
}
