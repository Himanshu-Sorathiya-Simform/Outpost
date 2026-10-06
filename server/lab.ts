/**
 * The instrument panel API under /api/_lab. Never chaos'd, never in the request log, always no-store.
 * Every change to lab state is announced to connected streams as a 'state' event.
 * Mount at the application root; paths here are absolute.
 */
import { z } from 'zod'
import {
  ChaosState,
  HeaderProfileBody,
  LAB_PREFIX,
  ReleasePatch,
  SessionControl,
  WireSpawnRequest,
  WireState,
  type LabState,
} from '../shared/contracts'
import { CHAOS_PRESET_NAMES, applyPreset } from './chaos'
import { events } from './events'
import { requestLog } from './log'
import { cancelPendingPushes, pushSubscriptionCount, sendPushToAll } from './push'
import { resetRuntime, runtime } from './runtime'
import { store } from './store'
import { HttpError, asyncRoute, exactRouter, sendError, sendJson, validate } from './util'

export const labRouter = exactRouter()

// ─── state ────────────────────────────────────────────────────────────────────
export function labState(): LabState {
  return {
    serverInstance: store.serverInstance,
    startedAt: store.startedAt,
    chaos: runtime.chaos,
    wire: runtime.wire,
    release: store.release,
    headerProfile: runtime.headerProfile,
    sessionTtlSec: store.sessionTtlSec,
    counters: {
      requests: runtime.counters.requests,
      chaosInjected: runtime.counters.chaosInjected,
      dispatches: store.counters.dispatches,
      pushSent: runtime.counters.pushSent,
      subscriptions: pushSubscriptionCount(),
      sessions: store.sessions.count(),
    },
  }
}

export function broadcastState(): void {
  events.broadcast({ type: 'state', state: labState() })
}

// ─── wire generator ───────────────────────────────────────────────────────────
let wireTimer: NodeJS.Timeout | null = null

/** (Re)starts the auto-filing timer from `runtime.wire`; stops it when auto is off. Call after every change to runtime.wire. */
export function syncWireTimer(): void {
  if (wireTimer) clearInterval(wireTimer)
  wireTimer = null
  if (!runtime.wire.auto) return
  wireTimer = setInterval(() => {
    store.spawnWireDispatch()
  }, runtime.wire.everySec * 1000)
  wireTimer.unref()
}

let detachWireListener: (() => void) | null = null

/** Hooks dispatch creation to the SSE 'wire' event and to push-on-new. Idempotent. */
export function installLabListeners(): void {
  if (detachWireListener) return
  detachWireListener = store.onDispatchCreated((dispatch, source) => {
    // Dispatches filed through the API are announced by the request log, not as wire traffic.
    if (source === 'wire') events.broadcast({ type: 'wire', dispatchId: dispatch.id, severity: dispatch.severity, title: dispatch.title })
    if (!runtime.wire.pushOnNew) return
    sendPushToAll({ kind: 'dispatch', dispatchId: dispatch.id }).catch((err: unknown) => {
      console.warn(`lab: push for ${dispatch.id} failed: ${err instanceof Error ? err.message : String(err)}`)
    })
  })
}

/** Stops every timer and listener this module owns. */
export function stopLab(): void {
  if (wireTimer) clearInterval(wireTimer)
  wireTimer = null
  detachWireListener?.()
  detachWireListener = null
  cancelPendingPushes()
}

// ─── request schemas ──────────────────────────────────────────────────────────
// Same grammar as the client's parser (src/lib/version/semver.ts), minus the leading 'v'.
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const semver = z.string().regex(SEMVER, 'Expected semver such as 1.4.0')

// minClient above latestClient is accepted on purpose: a contradictory release is a fine thing to test against.
const ReleaseInput = ReleasePatch.extend({
  latestClient: semver.optional(),
  minClient: semver.optional(),
  api: z.number().int().min(1).max(99).optional(),
  handbookEdition: z.string().trim().min(1).max(24).optional(),
})

const ChaosInput = ChaosState.refine((c) => new Set(c.rules.map((r) => r.id)).size === c.rules.length, { message: 'Rule ids must be unique', path: ['rules'] }).refine(
  (c) => c.rules.length <= 50,
  { message: 'At most 50 rules', path: ['rules'] },
)

const LogQuery = z.object({ since: z.coerce.number().int().min(0).optional() })

function bodyOrEmpty(body: unknown): unknown {
  return body === undefined ? {} : body
}

// ─── routes ───────────────────────────────────────────────────────────────────
labRouter.use(LAB_PREFIX, (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

labRouter.get('/api/_lab/state', (req, res) => {
  sendJson(req, res, labState(), { etag: false })
})

labRouter.get('/api/_lab/truth', (req, res) => {
  sendJson(req, res, store.truth(req.session), { etag: false })
})

// chaos
labRouter.get('/api/_lab/chaos', (req, res) => {
  sendJson(req, res, runtime.chaos, { etag: false })
})

labRouter.put(
  '/api/_lab/chaos',
  asyncRoute((req, res) => {
    runtime.chaos = validate(res, ChaosInput, req.body, 'chaos state')
    broadcastState()
    sendJson(req, res, runtime.chaos, { etag: false })
  }),
)

labRouter.post(
  '/api/_lab/chaos/preset/:name',
  asyncRoute((req, res) => {
    const next = applyPreset(runtime.chaos, req.params.name)
    if (!next) throw new HttpError(404, 'not_found', `No chaos preset "${req.params.name}". Known: ${CHAOS_PRESET_NAMES.join(', ')}`)
    runtime.chaos = next
    broadcastState()
    sendJson(req, res, runtime.chaos, { etag: false })
  }),
)

// wire
labRouter.put(
  '/api/_lab/wire',
  asyncRoute((req, res) => {
    const patch = validate(res, WireState.partial(), req.body, 'wire state')
    runtime.wire = { ...runtime.wire, ...patch }
    syncWireTimer()
    broadcastState()
    sendJson(req, res, runtime.wire, { etag: false })
  }),
)

labRouter.post(
  '/api/_lab/wire/spawn',
  asyncRoute((req, res) => {
    const { count = 1, severity } = validate(res, WireSpawnRequest, bodyOrEmpty(req.body), 'spawn request')
    const spawned = Array.from({ length: count }, () => {
      const { id, severity: filedSeverity, title } = store.spawnWireDispatch(severity ? { severity } : undefined)
      return { id, severity: filedSeverity, title }
    })
    sendJson(req, res, { spawned }, { status: 201, etag: false })
  }),
)

// release
labRouter.put(
  '/api/_lab/release',
  asyncRoute((req, res) => {
    const patch = validate(res, ReleaseInput, req.body, 'release state')
    // A fresh object, never a mutation: store.reset() also swaps the whole thing.
    store.release = { ...store.release, ...patch }
    broadcastState()
    sendJson(req, res, store.release, { etag: false })
  }),
)

// headers
labRouter.put(
  '/api/_lab/headers',
  asyncRoute((req, res) => {
    const { profile } = validate(res, HeaderProfileBody, req.body, 'header profile')
    runtime.headerProfile = profile
    broadcastState()
    sendJson(req, res, { profile }, { etag: false })
  }),
)

// session
labRouter.post(
  '/api/_lab/session',
  asyncRoute((req, res) => {
    const control = validate(res, SessionControl, req.body, 'session control')
    if (control.action === 'expire') store.sessions.expireAll()
    else store.sessionTtlSec = control.ttlSec
    broadcastState()
    sendJson(req, res, { sessionTtlSec: store.sessionTtlSec, sessions: store.sessions.count() }, { etag: false })
  }),
)

// request log
labRouter.get(
  '/api/_lab/log',
  asyncRoute((req, res) => {
    const { since } = validate(res, LogQuery, req.query, 'query')
    sendJson(req, res, requestLog.since(since), { etag: false })
  }),
)

labRouter.delete('/api/_lab/log', (req, res) => {
  requestLog.clear()
  sendJson(req, res, requestLog.since(), { etag: false })
})

// live stream
labRouter.get('/api/_lab/events', events.handler(labState))

// reset
labRouter.post('/api/_lab/reset', (req, res) => {
  store.reset()
  resetRuntime()
  requestLog.clear()
  cancelPendingPushes()
  syncWireTimer()
  broadcastState()
  sendJson(req, res, labState(), { etag: false })
})

// Anything else under the prefix is a 404 from here, so it can never reach the SPA fallback.
labRouter.use(LAB_PREFIX, (_req, res) => {
  sendError(res, 404, 'not_found', 'No such lab endpoint')
})
