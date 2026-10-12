// What it holds:  the worker's `periodicsync` handler: onPeriodicSync() answers the tag "digest-refresh" by fetching the digest, keeping it,
//                 updating the badge, notifying about urgent news, and telling the pages.
// What it means: Periodic Background Sync lets a site ask the BROWSER to wake its worker every so often with no page open (the page registers
//                the tag, src/pwa/periodic-sync.ts). It is Chromium only and for installed apps only, and the browser decides when: the
//                interval the page asks for is a request, and the real one depends on how much the site is used. The worker cannot assume a
//                window and must finish inside event.waitUntil. The digest is the server's summary of what was filed since a moment
//                (GET /api/digest?since=<iso>, docs/CONTRACTS.md 8.1): `generatedAt` is the moment to send next time, `newCount` and
//                `urgentCount` count what is new since then, `unread` is the number the app badge should show.
// Caching type:  runtime (the answer is written to the api bucket by the same store() the strategies use; nothing is precached).
// Caches touched: api-v<N> (read and written): the newest digest, stored under the plain URL '/api/digest'.
//
// Where the "last look" lives: in that stored digest. Its `generatedAt` becomes the next `since`. If the entry is gone (the api bucket is capped
// and trimmed oldest first, or clear-caches ran) the next run asks for "the last 24 hours" instead, which counts more as new but is not wrong.
// The page never asks for the plain '/api/digest', so the stored copy is only ever read here (network first would serve it if it did).
//
// What it does, step by step:
//   1. Ignore a tag that is not "digest-refresh".
//   2. Read the stored digest, if any, for `since`. A stored copy that cannot be read counts as none.
//   3. Fetch /api/digest?since=<that> straight from the network (the HTTP cache bypassed). This is the worker's own request, not a page's:
//      it does not pass through the fetch listener, and Lab -> Network shows it as "Server only" with no tab id.
//   4. Judge the answer. Only a 200 JSON body with generatedAt, newCount, urgentCount and unread of the right types counts. Anything else
//      (offline, 5xx, 429, HTML, a body missing fields) REJECTS the handler and posts NOTHING: a failure must never look like a success.
//   5. Store it (a failed write, even after a full disk was given room, is logged and not fatal), set the app badge to `unread` (src/sw/lib/badge.ts: a third writer of the badge, after the page and a push), and when
//      `urgentCount` is above 0 show ONE notification (tag "digest-urgent", so a later run replaces it; a click opens /inbox) unless a window
//      is visible and focused, in which case the person is already looking.
//   6. Tell the pages: periodic-sync-complete { tag, newCount }. The page refetches its digest and inbox queries, with no toast.

import { API_CACHE, API_LIMIT } from './config'
import { lookup, store, type CacheTarget } from './caching/runtime'
import { applyBadge } from './lib/badge'
import { tellPages } from './lib/messages'
import { tryNetwork } from './lib/network'
import { scope } from './lib/scope'
import { showNotice, windowIsFocused } from './push'

/** The tag the page registers (PERIODIC_TAG_DIGEST in shared/sw-protocol.ts; a test checks the two are the same). */
export const DIGEST_TAG = 'digest-refresh'

const DIGEST_PATH = '/api/digest'
const URGENT_TAG = 'digest-urgent'

/** The Periodic Background Sync event. TypeScript's worker library does not describe it yet. */
export interface PeriodicSyncEvent extends ExtendableEvent {
  readonly tag: string
}

/** Where the digest is kept: the api bucket, under the plain URL, capped like every other runtime entry in it. */
const DIGEST_TARGET: CacheTarget = { readFrom: [API_CACHE], writeTo: API_CACHE, limit: API_LIMIT }

interface DigestSummary {
  generatedAt: string
  newCount: number
  urgentCount: number
  unread: number
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

/** The four fields the handler uses, or null when the body is not a digest. Plain checks: the worker carries no schema library. */
function readSummary(body: unknown): DigestSummary | null {
  if (typeof body !== 'object' || body === null) return null
  const digest = body as Record<string, unknown>
  const { generatedAt, newCount, urgentCount, unread } = digest
  if (typeof generatedAt !== 'string' || Number.isNaN(Date.parse(generatedAt))) return null
  if (!isCount(newCount) || !isCount(urgentCount) || !isCount(unread)) return null
  return { generatedAt, newCount, urgentCount, unread }
}

/** `generatedAt` of the digest kept last time, or null: nothing kept, or what is kept cannot be read. */
async function lastLook(): Promise<string | null> {
  const found = await lookup(DIGEST_TARGET, new URL(DIGEST_PATH, scope.location.origin).href)
  if (!found) return null
  try {
    return readSummary(await found.hit.json())?.generatedAt ?? null
  } catch {
    return null
  }
}

async function refresh(): Promise<void> {
  const since = await lastLook()
  const url = new URL(since ? `${DIGEST_PATH}?since=${encodeURIComponent(since)}` : DIGEST_PATH, scope.location.origin)
  const attempt = await tryNetwork(new Request(url, { cache: 'no-cache', headers: { Accept: 'application/json' } }), url)
  if (attempt.kind === 'failed') throw new Error(`The digest could not be fetched: the network did not answer`)
  if (attempt.kind === 'bad') throw new Error(`The digest answer was unusable (${attempt.reason})`)
  if (attempt.kind === 'real') throw new Error(`The digest answered ${attempt.response.status}`)

  const digest = readSummary(await attempt.response.clone().json())
  if (!digest) throw new Error('The digest answered 200 but without generatedAt, newCount, urgentCount and unread')

  // A failed write is logged by store() and is not fatal: the next run asks for a wider window and counts more as new.
  await store(DIGEST_TARGET, new URL(DIGEST_PATH, scope.location.origin), attempt.response)
  await applyBadge(digest.unread, 'a periodic sync')
  if (digest.urgentCount > 0 && !(await windowIsFocused())) {
    const dispatches = digest.urgentCount === 1 ? 'dispatch' : 'dispatches'
    await showNotice({
      title: `${digest.urgentCount} urgent ${dispatches}`,
      body: `${digest.newCount} new since your last look, ${digest.urgentCount} urgent. ${digest.unread} unread.`,
      tag: URGENT_TAG,
      url: '/inbox',
      kind: 'digest',
    })
  }
  await tellPages({ type: 'periodic-sync-complete', tag: DIGEST_TAG, newCount: digest.newCount })
}

/** The `periodicsync` listener's body. */
export function onPeriodicSync(event: PeriodicSyncEvent): void {
  if (event.tag !== DIGEST_TAG) return
  event.waitUntil(refresh())
}
