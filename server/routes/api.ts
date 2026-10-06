/**
 * The product API: everything except lab, push, bench and media.
 * Mount at the application root; paths here are absolute (`/api/...`).
 * Unknown paths are deliberately not handled, so they fall through to the final 404.
 */
import { z } from 'zod'
import { DispatchCreate, DispatchPatch, HDR, Severity, SessionCreate, type VersionInfo } from '../../shared/contracts'
import { runtime } from '../runtime'
import { clearSessionCookie, requireSession, setSessionCookie } from '../session'
import { dispatchEtag, store, toWireDispatch } from '../store'
import { HttpError, addNote, asyncRoute, exactRouter, revEtag, sendError, sendJson, validate, weakEtag } from '../util'

export const apiRouter = exactRouter()

const SERVER_VERSION = process.env.APP_VERSION ?? '1.0.0'

/** Lists and digests are shaped differently while schema drift is on, so a validator from before the flip must not match. */
const driftSalt = (): string => (runtime.chaos.schemaDrift ? 'drift' : 'std')

const boolParam = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1')
const ListQuery = z.object({
  severity: Severity.optional(),
  station: z.string().optional(),
  q: z.string().optional(),
  unread: boolParam.optional(),
  starred: boolParam.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})
const DigestQuery = z.object({ since: z.iso.datetime({ offset: true }).optional() })

/** `?station=&severity=` (an empty control in a form) means "no filter", not "invalid filter". */
function withoutEmpty(query: unknown): Record<string, unknown> {
  if (typeof query !== 'object' || query === null) return {}
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ''))
}

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
}

// ─── liveness, version, session ───────────────────────────────────────────────
apiRouter.get('/api/ping', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.status(204).end()
})

apiRouter.get('/api/version', (req, res) => {
  const body: VersionInfo = {
    server: SERVER_VERSION,
    api: store.release.api,
    latestClient: store.release.latestClient,
    minClient: store.release.minClient,
    serverInstance: store.serverInstance,
    startedAt: store.startedAt,
    now: new Date().toISOString(),
  }
  sendJson(req, res, body, { etag: false })
})

apiRouter.get('/api/session', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  sendJson(req, res, { session: req.session }, { etag: false })
})

apiRouter.post(
  '/api/session',
  asyncRoute((req, res) => {
    const { callsign } = validate(res, SessionCreate, bodyRecord(req.body), 'sign-in')
    // A new login never inherits an old session id.
    if (req.sessionId) store.sessions.destroy(req.sessionId)
    const { id, session } = store.sessions.create(callsign)
    setSessionCookie(res, id, store.sessionTtlSec)
    res.setHeader('Cache-Control', 'no-store')
    sendJson(req, res, { session }, { etag: false })
  }),
)

apiRouter.delete('/api/session', (req, res) => {
  if (req.sessionId) store.sessions.destroy(req.sessionId)
  clearSessionCookie(res)
  res.setHeader('Cache-Control', 'no-store')
  sendJson(req, res, { session: null }, { etag: false })
})

// ─── dispatches ───────────────────────────────────────────────────────────────
apiRouter.get(
  '/api/dispatches',
  asyncRoute((req, res) => {
    const filters = validate(res, ListQuery, withoutEmpty(req.query), 'query')
    const page = store.listDispatches(filters)
    sendJson(req, res, { ...page, items: page.items.map(toWireDispatch) }, { rev: page.feedRev })
  }),
)

apiRouter.get(
  '/api/dispatches/:id',
  asyncRoute((req, res) => {
    const dispatch = store.getDispatch(req.params.id)
    if (!dispatch) throw new HttpError(404, 'not_found', `No dispatch ${req.params.id}`)
    sendJson(req, res, toWireDispatch(dispatch), { etag: dispatchEtag(dispatch), rev: dispatch.rev })
  }),
)

apiRouter.post(
  '/api/dispatches',
  asyncRoute((req, res) => {
    const session = requireSession(req, res, 'Filing a dispatch needs an operator session. Clock in first.')
    if (!session) return

    // The header wins over the body: a retrying client can only ever hold one key per attempt.
    const headerKey = req.get('Idempotency-Key')?.trim()
    const raw = bodyRecord(req.body)
    const input = validate(res, DispatchCreate, { ...raw, clientId: headerKey || raw.clientId }, 'dispatch')
    if (!store.getStation(input.stationId)) {
      addNote(res, 'validation-failed')
      throw new HttpError(422, 'validation_failed', `Invalid dispatch. stationId: no station "${input.stationId}"`, [
        { code: 'custom', path: ['stationId'], message: 'Unknown station' },
      ])
    }

    const { dispatch, replay } = store.createDispatch(input, session.operator.callsign)
    if (replay) {
      addNote(res, 'idempotent-replay')
      res.setHeader('Idempotent-Replay', 'true')
    } else {
      res.setHeader('Location', `/api/dispatches/${dispatch.id}`)
    }
    sendJson(req, res, toWireDispatch(dispatch), { status: replay ? 200 : 201, etag: dispatchEtag(dispatch), rev: dispatch.rev })
  }),
)

apiRouter.patch(
  '/api/dispatches/:id',
  asyncRoute((req, res) => {
    const patch = validate(res, DispatchPatch, bodyRecord(req.body), 'patch')
    if (patch.acked !== undefined && !requireSession(req, res, 'Acknowledging a dispatch needs an operator session. Clock in first.')) return

    const result = store.patchDispatch(req.params.id, patch, req.get('If-Match') ?? undefined)
    if (!result.ok && result.reason === 'not_found') throw new HttpError(404, 'not_found', `No dispatch ${req.params.id}`)
    if (!result.ok) {
      // The caller learns the current state in the same round trip and can rebase without a second fetch.
      addNote(res, 'if-match-412')
      res.setHeader('ETag', dispatchEtag(result.current))
      res.setHeader(HDR.rev, String(result.current.rev))
      sendError(res, 412, 'conflict', `If-Match ${req.get('If-Match')} does not match current revision ${result.current.rev}`, {
        current: toWireDispatch(result.current),
      })
      return
    }
    sendJson(req, res, toWireDispatch(result.dispatch), { etag: dispatchEtag(result.dispatch), rev: result.dispatch.rev })
  }),
)

// ─── inbox, digest ────────────────────────────────────────────────────────────
apiRouter.get('/api/inbox/summary', (req, res) => {
  const summary = store.inboxSummary()
  // asOf changes on every call; the validator covers only the counts.
  sendJson(req, res, summary, { etag: weakEtag(`${summary.feedRev}:${summary.unread}:${summary.urgentUnread}:${summary.total}`), rev: summary.feedRev })
})

apiRouter.post('/api/inbox/read-all', (req, res) => {
  const summary = store.markAllRead()
  sendJson(req, res, summary, { rev: summary.feedRev, etag: false })
})

apiRouter.get(
  '/api/digest',
  asyncRoute((req, res) => {
    const { since } = validate(res, DigestQuery, withoutEmpty(req.query), 'query')
    const digest = store.digest(since)
    const etag = weakEtag(
      [driftSalt(), digest.since, digest.newCount, digest.urgentCount, digest.unread, ...digest.items.map((d) => `${d.id}:${d.rev}`)].join('|'),
    )
    sendJson(req, res, { ...digest, items: digest.items.map(toWireDispatch) }, { etag, rev: store.feedRev() })
  }),
)

// ─── stations, signal ─────────────────────────────────────────────────────────
apiRouter.get('/api/stations', (req, res) => {
  const list = store.listStations()
  // asOf changes on every call; the validator covers only what a station revision covers.
  sendJson(req, res, list, { etag: weakEtag(list.items.map((s) => `${s.id}:${s.rev}`).join('|')) })
})

apiRouter.get(
  '/api/stations/:codeOrId',
  asyncRoute((req, res) => {
    const station = store.getStation(req.params.codeOrId)
    if (!station) throw new HttpError(404, 'not_found', `No station ${req.params.codeOrId}`)
    sendJson(req, res, station, { etag: revEtag(station.id, station.rev), rev: station.rev })
  }),
)

apiRouter.get('/api/signal', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  sendJson(req, res, store.signalBoard(), { etag: false })
})

// ─── handbook ─────────────────────────────────────────────────────────────────
apiRouter.get('/api/handbook', (req, res) => {
  sendJson(req, res, store.handbookIndex())
})

apiRouter.get(
  '/api/handbook/:slug',
  asyncRoute((req, res) => {
    const chapter = store.handbookChapter(req.params.slug)
    if (!chapter) throw new HttpError(404, 'not_found', `No handbook chapter "${req.params.slug}"`)
    sendJson(req, res, chapter)
  }),
)
