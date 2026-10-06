/**
 * Web Push, server side: VAPID keys, subscription store and the send pipeline.
 *
 * The keys and subscriptions live in server/.data/ (override with OUTPOST_DATA_DIR) and survive
 * restarts and lab resets. A subscription is bound to the VAPID key it was created with, so if the
 * key file is lost and regenerated, the stored subscriptions are dropped with it.
 * Key material is never logged.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Default import on purpose: web-push is CommonJS and Node's ESM loader cannot see its named exports.
import webpush from 'web-push'
import { z } from 'zod'
import {
  PushSendRequest,
  PushSubscribeRequest,
  PushUnsubscribeRequest,
  type PushPayload,
  type PushSendResult,
  type PushSubscriptionInfo,
} from '../shared/contracts'
import { events } from './events'
import { runtime } from './runtime'
import { store } from './store'
import { HttpError, asyncRoute, exactRouter, sendJson, validate } from './util'

const DATA_DIR = process.env.OUTPOST_DATA_DIR ?? fileURLToPath(new URL('./.data', import.meta.url))
const VAPID_FILE = join(DATA_DIR, 'vapid.json')
const SUBSCRIPTIONS_FILE = join(DATA_DIR, 'subscriptions.json')
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:operator@outpost.example'

/** Default lifetime of a message at the push service if the device is offline: short, so a forgotten test push does not turn up next week. */
const DEFAULT_TTL_SEC = 3600
const SEND_TIMEOUT_MS = 10_000
const MAX_PENDING_DELAYED = 25
const MAX_SUBSCRIPTIONS = 50
const NOTIFICATION_ICON = '/icons/icon-192.png'

// ─── persistence ──────────────────────────────────────────────────────────────
const StoredVapid = z.object({ publicKey: z.string().min(40), privateKey: z.string().min(20), createdAt: z.iso.datetime() })
const StoredSubscription = z.object({
  id: z.string(),
  endpoint: z.url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  label: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastResult: z.enum(['never', 'ok', 'failed']),
})
type StoredSubscription = z.infer<typeof StoredSubscription>

interface PushState {
  vapid: { publicKey: string; privateKey: string }
  subscriptions: Map<string, StoredSubscription>
}

/** Write-then-rename, so a crash mid-write can never leave a half-written file behind. */
function writeAtomic(file: string, text: string, mode: number): void {
  mkdirSync(DATA_DIR, { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, text, { mode })
  renameSync(temp, file)
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    // A missing file is the normal first boot. Anything else (bad JSON, permissions) is worth a line.
    if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) console.warn(`push: could not read ${file}: ${err instanceof Error ? err.message : String(err)}`)
    return undefined
  }
}

function loadVapid(): { keys: { publicKey: string; privateKey: string }; generated: boolean } {
  const raw = readJson(VAPID_FILE)
  const parsed = StoredVapid.safeParse(raw)
  if (parsed.success) return { keys: parsed.data, generated: false }
  if (raw !== undefined) console.warn('push: vapid.json is unusable; generated new keys, which invalidates every stored subscription')
  const keys = webpush.generateVAPIDKeys()
  try {
    writeAtomic(VAPID_FILE, JSON.stringify({ ...keys, createdAt: new Date().toISOString() }, null, 2), 0o600)
  } catch (err) {
    console.warn(`push: could not persist VAPID keys (${err instanceof Error ? err.message : String(err)}); they will change on the next start`)
  }
  return { keys, generated: true }
}

function loadSubscriptions(): Map<string, StoredSubscription> {
  const raw = readJson(SUBSCRIPTIONS_FILE)
  const map = new Map<string, StoredSubscription>()
  if (raw === undefined) return map
  if (!Array.isArray(raw)) {
    console.warn('push: subscriptions.json is not a list; starting with none')
    return map
  }
  // Keep every record that still parses; one damaged entry must not cost the rest.
  for (const item of raw) {
    const parsed = StoredSubscription.safeParse(item)
    if (parsed.success) map.set(parsed.data.id, parsed.data)
  }
  return map
}

let state: PushState | null = null

function getState(): PushState {
  if (state) return state
  const { keys, generated } = loadVapid()
  const subscriptions = generated ? new Map<string, StoredSubscription>() : loadSubscriptions()
  state = { vapid: keys, subscriptions }
  if (generated) persistSubscriptions(state)
  return state
}

function persistSubscriptions(s: PushState): void {
  try {
    writeAtomic(SUBSCRIPTIONS_FILE, JSON.stringify([...s.subscriptions.values()], null, 2), 0o600)
  } catch (err) {
    console.warn(`push: could not persist subscriptions (${err instanceof Error ? err.message : String(err)})`)
  }
}

// ─── public helpers ───────────────────────────────────────────────────────────
export function pushSubscriptionCount(): number {
  return getState().subscriptions.size
}

/** Short, non-secret identifier of the public key, for the startup banner. */
export function vapidFingerprint(): string {
  return createHash('sha256').update(getState().vapid.publicKey).digest('hex').slice(0, 12)
}

function info(sub: StoredSubscription): PushSubscriptionInfo {
  return {
    id: sub.id,
    endpointHost: new URL(sub.endpoint).host,
    endpointTail: sub.endpoint.slice(-12),
    label: sub.label,
    createdAt: sub.createdAt,
    lastResult: sub.lastResult,
  }
}

const subscriptionIdOf = (endpoint: string): string => `ps-${createHash('sha256').update(endpoint).digest('hex').slice(0, 10)}`

// ─── payloads ─────────────────────────────────────────────────────────────────
/** First ~140 characters of a dispatch body, cut at a word boundary. */
function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= 140) return flat
  const cut = flat.slice(0, 140)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 80))}...`
}

function buildPayload(r: PushSendRequest): PushPayload {
  const dispatch = r.dispatchId ? store.getDispatch(r.dispatchId) : undefined
  if (r.dispatchId && !dispatch) throw new HttpError(404, 'not_found', `No dispatch ${r.dispatchId}`)
  if (r.kind === 'custom' && !r.title?.trim()) throw new HttpError(422, 'validation_failed', 'kind "custom" needs a title')

  const silent = r.kind === 'silent-badge' || r.kind === 'sync-poke'
  const base = {
    v: 1 as const,
    kind: r.kind,
    dispatchId: dispatch?.id ?? null,
    // Omitted means "show the truth"; an explicit null means "leave the badge alone".
    badgeCount: r.badgeCount === undefined ? store.inboxSummary().unread : r.badgeCount,
    icon: NOTIFICATION_ICON,
    // Dispatch art is SVG, which notification images do not render.
    image: null,
    silent,
    sentAt: new Date().toISOString(),
  }

  switch (r.kind) {
    case 'dispatch': {
      if (!dispatch) throw new HttpError(422, 'validation_failed', 'kind "dispatch" needs a dispatchId')
      return {
        ...base,
        title: r.title ?? `${dispatch.stationCode}: ${dispatch.title}`,
        body: r.body ?? excerpt(dispatch.body),
        url: r.url ?? `/log/${dispatch.id}`,
        tag: r.tag ?? `dispatch-${dispatch.id}`,
        actions: r.actions ?? [
          { action: 'open', title: 'Open' },
          { action: 'ack', title: 'Acknowledge' },
        ],
        requireInteraction: r.requireInteraction ?? dispatch.severity === 'critical',
      }
    }
    case 'custom':
      return { ...base, title: r.title ?? '', body: r.body ?? '', url: r.url ?? '/log', tag: r.tag ?? null, actions: r.actions ?? [], requireInteraction: r.requireInteraction ?? false }
    case 'silent-badge':
      return { ...base, title: r.title ?? 'Badge update', body: r.body ?? 'The unread count changed.', url: r.url ?? '/inbox', tag: r.tag ?? null, actions: [], requireInteraction: false }
    case 'sync-poke':
      return { ...base, title: r.title ?? 'Sync poke', body: r.body ?? 'The server has something new to fetch.', url: r.url ?? '/log', tag: r.tag ?? null, actions: [], requireInteraction: false }
  }
}

// ─── sending ──────────────────────────────────────────────────────────────────
function selectTargets(tail: string | undefined): StoredSubscription[] {
  const all = [...getState().subscriptions.values()]
  if (tail === undefined) return all
  const match = all.filter((s) => s.endpoint.endsWith(tail))
  if (match.length === 0) throw new HttpError(404, 'not_found', `No subscription with an endpoint ending in "${tail}"`)
  return match
}

function describeFailure(err: unknown): { statusCode?: number; error: string } {
  if (err instanceof webpush.WebPushError) {
    const detail = err.body.replace(/\s+/g, ' ').trim().slice(0, 160)
    return { statusCode: err.statusCode, error: `Push service answered ${err.statusCode}${detail ? `: ${detail}` : ''}` }
  }
  if (err instanceof Error) {
    const code = 'code' in err && typeof err.code === 'string' ? ` (${err.code})` : ''
    return { error: `${err.message.slice(0, 200)}${code}` }
  }
  return { error: 'Unknown push failure' }
}

async function deliver(payload: PushPayload, targets: StoredSubscription[], request: PushSendRequest, scheduledInSec: number): Promise<PushSendResult> {
  const { vapid } = getState()
  const body = JSON.stringify(payload)
  const options = {
    TTL: request.ttl ?? DEFAULT_TTL_SEC,
    urgency: request.urgency ?? 'normal',
    timeout: SEND_TIMEOUT_MS,
    vapidDetails: { subject: VAPID_SUBJECT, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
  } as const

  const results = await Promise.all(
    targets.map(async (sub): Promise<PushSendResult['results'][number]> => {
      try {
        const sent = await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, options)
        return { id: sub.id, ok: true, statusCode: sent.statusCode }
      } catch (err) {
        return { id: sub.id, ok: false, ...describeFailure(err) }
      }
    }),
  )

  const s = getState()
  let pruned = 0
  for (const result of results) {
    const sub = s.subscriptions.get(result.id)
    if (!sub) continue // unsubscribed while the request was in flight
    if (result.statusCode === 404 || result.statusCode === 410) {
      s.subscriptions.delete(sub.id)
      pruned += 1
    } else {
      sub.lastResult = result.ok ? 'ok' : 'failed'
    }
  }
  if (results.length > 0) persistSubscriptions(s)

  const delivered = results.filter((r) => r.ok).length
  runtime.counters.pushSent += delivered
  if (results.length > 0) events.broadcast({ type: 'push', attempted: results.length, delivered, title: payload.title })
  // `failed` counts every attempt that did not reach the push service, pruned ones included.
  return { attempted: results.length, delivered, failed: results.length - delivered, pruned, scheduledInSec, payload, results }
}

const pending = new Set<NodeJS.Timeout>()

/** Drops every delayed send that has not fired yet (lab reset, shutdown). */
export function cancelPendingPushes(): void {
  for (const timer of pending) clearTimeout(timer)
  pending.clear()
}

async function sendPush(request: PushSendRequest): Promise<PushSendResult> {
  const targets = selectTargets(request.targetEndpointTail)
  // Built now even for a delayed send, so a bad request fails immediately instead of 30 s later.
  const preview = buildPayload(request)
  const delaySec = request.delaySec ?? 0
  if (delaySec === 0) return deliver(preview, targets, request, 0)

  if (pending.size >= MAX_PENDING_DELAYED) throw new HttpError(429, 'rate_limited', `${MAX_PENDING_DELAYED} delayed pushes are already waiting. Let some fire first.`)
  const timer = setTimeout(() => {
    pending.delete(timer)
    // Targets and payload are resolved again at fire time: subscriptions and the unread count may have moved.
    Promise.resolve()
      .then(() => deliver(buildPayload(request), selectTargets(request.targetEndpointTail), request, delaySec))
      .catch((err: unknown) => console.warn(`push: delayed send skipped: ${err instanceof Error ? err.message : String(err)}`))
  }, delaySec * 1000)
  timer.unref()
  pending.add(timer)
  return { attempted: targets.length, delivered: 0, failed: 0, pruned: 0, scheduledInSec: delaySec, payload: preview, results: [] }
}

/** Sends to every subscription. Used by the wire generator; the HTTP route goes through the same code. */
export function sendPushToAll(partial: Partial<PushSendRequest>): Promise<PushSendResult> {
  return sendPush(PushSendRequest.parse(partial))
}

// ─── routes ───────────────────────────────────────────────────────────────────
export const pushRouter = exactRouter()

pushRouter.get('/api/push/vapid', (req, res) => {
  sendJson(req, res, { publicKey: getState().vapid.publicKey }, { etag: false })
})

pushRouter.get('/api/push/subscriptions', (req, res) => {
  sendJson(req, res, { items: [...getState().subscriptions.values()].map(info) }, { etag: false })
})

pushRouter.post(
  '/api/push/subscribe',
  asyncRoute((req, res) => {
    const { subscription, label } = validate(res, PushSubscribeRequest, req.body, 'subscription')
    // Every real push service is https, and web-push cannot talk to anything else.
    if (new URL(subscription.endpoint).protocol !== 'https:') throw new HttpError(422, 'validation_failed', 'Invalid subscription. endpoint: push services are always https')

    const s = getState()
    const id = subscriptionIdOf(subscription.endpoint)
    const existing = s.subscriptions.get(id)
    if (!existing && s.subscriptions.size >= MAX_SUBSCRIPTIONS) throw new HttpError(429, 'rate_limited', `${MAX_SUBSCRIPTIONS} subscriptions are already stored. Unsubscribe some first.`)
    // The same browser subscribing again refreshes its keys and label; it does not create a second entry.
    const stored: StoredSubscription = {
      id,
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: subscription.keys,
      label: label ?? existing?.label ?? null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      lastResult: existing?.lastResult ?? 'never',
    }
    s.subscriptions.set(id, stored)
    persistSubscriptions(s)
    sendJson(req, res, info(stored), { status: existing ? 200 : 201, etag: false })
  }),
)

pushRouter.post(
  '/api/push/unsubscribe',
  asyncRoute((req, res) => {
    const { endpoint, id } = validate(res, PushUnsubscribeRequest, req.body, 'unsubscribe request')
    const s = getState()
    const key = id ?? (endpoint ? subscriptionIdOf(endpoint) : '')
    const removed = s.subscriptions.delete(key)
    if (removed) persistSubscriptions(s)
    sendJson(req, res, { removed }, { etag: false })
  }),
)

pushRouter.post(
  '/api/push/send',
  asyncRoute(async (req, res) => {
    const request = validate(res, PushSendRequest, req.body, 'push request')
    sendJson(req, res, await sendPush(request), { etag: false })
  }),
)
