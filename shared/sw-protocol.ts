/**
 * The contract between the PAGE and YOUR service worker.
 *
 * The app side of this protocol is already implemented (src/lib/bridge): it listens for
 * `SwToPage` messages, validates them, reacts (invalidates React Query, refetches, navigates)
 * and logs every message — valid or not — in Lab → Queue & Bridge.
 *
 * Your job is the other side: write a service worker that sends these messages, and that
 * reacts to `PageToSw`. Adopt, rename or ignore anything here — the app tolerates unknown messages.
 */
import { z } from 'zod'
import { DispatchCreate, PushPayload } from './contracts'

// ─── Suggested names (used by the app's UI labels and the docs) ────────────────
export const SYNC_TAG_OUTBOX = 'outbox-flush' // Background Sync tag
export const PERIODIC_TAG_DIGEST = 'digest-refresh' // Periodic Background Sync tag
export const OUTBOX_DB = 'outpost-outbox' // IndexedDB database
export const OUTBOX_STORE = 'outbox' // object store, keyPath 'id'
export const SW_BROADCAST_CHANNEL = 'outpost-sw' // optional BroadcastChannel the SW may post to

/** Shape of one record in the IndexedDB outbox (used by src/pwa/sync.ts stubs and your SW). */
export const OutboxItem = z.object({
  id: z.string(), // == payload.clientId == Idempotency-Key
  createdAt: z.iso.datetime(),
  attempts: z.number().int(),
  status: z.enum(['queued', 'sending', 'failed']),
  lastError: z.string().nullable(),
  payload: DispatchCreate,
})
export type OutboxItem = z.infer<typeof OutboxItem>

// ─── SW → page ────────────────────────────────────────────────────────────────
export const SwToPage = z.discriminatedUnion('type', [
  /** A stale-while-revalidate refresh wrote a newer response. App: invalidate matching queries. */
  z.object({ type: z.literal('cache-updated'), url: z.string(), strategy: z.string().optional(), cacheName: z.string().optional() }),
  /** A `sync` event finished replaying the outbox. App: refetch feed + inbox, clear pending UI. */
  z.object({ type: z.literal('sync-complete'), tag: z.string(), succeeded: z.array(z.string()), failed: z.array(z.string()) }),
  /** A `periodicsync` event finished. */
  z.object({ type: z.literal('periodic-sync-complete'), tag: z.string(), newCount: z.number().int() }),
  /** notificationclick on an already-open window. App: router.navigate(url). */
  z.object({ type: z.literal('navigate'), url: z.string() }),
  /** A push arrived while a window was open (so the app can show an in-page toast instead). */
  z.object({ type: z.literal('push-received'), payload: PushPayload }),
  /** Reply to `get-version`, and/or sent on activate. */
  z.object({ type: z.literal('sw-version'), version: z.string(), caches: z.array(z.string()).optional() }),
  /** Free-form debug line; shown in Lab → Service Worker. */
  z.object({ type: z.literal('log'), level: z.enum(['debug', 'info', 'warn', 'error']).default('info'), message: z.string() }),
])
export type SwToPage = z.infer<typeof SwToPage>

// ─── page → SW ────────────────────────────────────────────────────────────────
export const PageToSw = z.discriminatedUnion('type', [
  z.object({ type: z.literal('skip-waiting') }),
  z.object({ type: z.literal('get-version') }),
  z.object({ type: z.literal('clear-caches'), prefix: z.string().optional() }),
  z.object({ type: z.literal('prefetch'), urls: z.array(z.string()) }),
  z.object({ type: z.literal('ping'), nonce: z.string() }),
])
export type PageToSw = z.infer<typeof PageToSw>

export function parseSwMessage(data: unknown): { ok: true; message: SwToPage } | { ok: false; reason: string } {
  const r = SwToPage.safeParse(data)
  return r.success ? { ok: true, message: r.data } : { ok: false, reason: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') }
}
