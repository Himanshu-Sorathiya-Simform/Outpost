/**
 * First middleware in the chain: stamps every response with the custom headers, counts the
 * request and writes one RequestLogEntry when the response ends (or the socket dies).
 */
import { randomBytes } from 'node:crypto'
import type { Request, RequestHandler } from 'express'
import { HDR, LAB_PREFIX, type RequestLogEntry } from '../shared/contracts'
import { events } from './events'
import { requestLog } from './log'
import { runtime } from './runtime'
import { store } from './store'
import { sendError } from './util'

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz'

/** 'r-' plus 7 base36 characters, short enough to read out of a log line. */
export function newRequestId(): string {
  let id = 'r-'
  for (const byte of randomBytes(7)) id += BASE36[byte % 36]
  return id
}

/** True for /api/_lab and everything below it: never chaos'd, never logged, always no-store. */
export function isLabPath(path: string): boolean {
  return path === LAB_PREFIX || path.startsWith(`${LAB_PREFIX}/`)
}

/** Headers a cross-origin page (or a dev tool reading them) may see beyond the CORS-safelisted set. */
const EXPOSED_HEADERS = [
  HDR.requestId,
  HDR.servedAt,
  HDR.servedBy,
  HDR.apiVersion,
  HDR.rev,
  HDR.chaos,
  HDR.swSource,
  'Idempotent-Replay',
  'Retry-After',
  'ETag',
  'Location',
  'Cache-Control',
].join(', ')

/** Request headers worth showing next to a log line: the ones that decide whether a cache may answer. */
const LOGGED_REQUEST_HEADERS = ['if-none-match', 'if-match', 'if-modified-since', 'idempotency-key', 'cache-control', 'range', 'purpose'] as const

function headerValue(req: Request, name: string): string | null {
  const value = req.headers[name]
  if (Array.isArray(value)) return value.join(', ')
  return value ?? null
}

function loggedHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of LOGGED_REQUEST_HEADERS) {
    const value = headerValue(req, name)
    if (value !== null) out[name] = value
  }
  return out
}

function notesOf(locals: Record<string, unknown>): string[] {
  const notes = locals.notes
  return Array.isArray(notes) ? notes.filter((n): n is string => typeof n === 'string') : []
}

/**
 * Refuses writes whose Origin is not the host being called. The server sits on localhost with cookie
 * sessions and unauthenticated lab endpoints (reset, chaos), so without this any page open in the same
 * browser could POST to it. Requests without an Origin (curl, tests, same-site navigations) are not browser
 * cross-site writes and pass; the dev proxy forwards the page's own Host, so it matches too.
 */
export const sameOriginWrites: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin
  if (origin === undefined || req.method === 'GET' || req.method === 'HEAD') {
    next()
    return
  }
  let originHost: string | null = null
  try {
    originHost = new URL(origin).host
  } catch {
    originHost = null // "null" and other non-URL origins
  }
  if (originHost !== null && originHost === req.headers.host) {
    next()
    return
  }
  sendError(res, 403, 'forbidden', 'Cross-origin writes are refused: call the API from the origin that serves it (or through the Vite proxy).')
}

export const metaMiddleware: RequestHandler = (req, res, next) => {
  const requestId = newRequestId()
  res.locals.requestId = requestId
  res.locals.notes = []

  res.setHeader(HDR.requestId, requestId)
  res.setHeader(HDR.servedAt, new Date().toISOString())
  res.setHeader(HDR.servedBy, `outpost/${store.serverInstance}`)
  res.setHeader(HDR.apiVersion, String(store.release.api))
  res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS)

  // The lab is the instrument panel, not part of the traffic being measured.
  if (isLabPath(req.path)) {
    next()
    return
  }

  runtime.counters.requests += 1

  const startedAt = performance.now()
  // `res.socket` is detached by Node when the response finishes, so the request's socket is kept here.
  const socket = req.socket
  const bytesBefore = socket.bytesWritten
  let logged = false

  const record = (status: number): void => {
    if (logged) return
    logged = true
    const chaos: unknown = res.locals.chaos
    const entry: Omit<RequestLogEntry, 'seq'> = {
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      // Wire bytes for this response, headers included (what a network panel calls "transferred").
      bytes: Math.max(0, socket.bytesWritten - bytesBefore),
      requestId,
      dest: headerValue(req, 'sec-fetch-dest'),
      mode: headerValue(req, 'sec-fetch-mode'),
      site: headerValue(req, 'sec-fetch-site'),
      tab: headerValue(req, 'x-tab-id'),
      chaos: typeof chaos === 'string' ? chaos : null,
      notes: notesOf(res.locals),
      reqHeaders: loggedHeaders(req),
    }
    events.broadcast({ type: 'log', entry: requestLog.push(entry) })
  }

  // 'finish': the response was fully written. 'close' without 'finish': the socket went away first
  // (client abort, injected drop, server-offline), which the log reports as status 0.
  res.on('finish', () => record(res.statusCode))
  res.on('close', () => record(res.writableFinished ? res.statusCode : 0))
  next()
}
