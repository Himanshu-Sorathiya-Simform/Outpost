/**
 * Small shared helpers for the server: error plumbing, JSON responses with conditional-request
 * support, a seeded PRNG and id helpers. No state lives here.
 */
import { createHash, randomBytes } from 'node:crypto'
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import type { z } from 'zod'
import { HDR, type ApiErrorBody } from '../shared/contracts'

/** Path parameters are always single strings here (no wildcard routes), which Express' default typing does not know. */
type RouteParams = Record<string, string>

export type ApiErrorCode = ApiErrorBody['error']['code']

/** Throw from anywhere inside a route; `asyncRoute` turns it into an `ApiErrorBody` response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

/**
 * Router whose matching is exact: Express would otherwise answer `/API/ping` and `/api/ping/` from the same
 * handler while the cache policy, the chaos rules and the lab exemption (all plain string prefixes) see a
 * different, unclassified path, so `/API/dispatches` would be cached like a document and never chaos'd.
 */
export const exactRouter = (): Router => Router({ caseSensitive: true, strict: true })

// ─── ids, numbers, time ───────────────────────────────────────────────────────
/** Random lowercase hex id. Not deterministic on purpose: request ids and instance ids must differ per run. */
export function newId(length = 8): string {
  return randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** FNV-1a, 32 bit. Turns any string into a PRNG seed. */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: tiny seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)]
  if (item === undefined) throw new Error('pick() called with an empty list')
  return item
}

// ─── request log notes ────────────────────────────────────────────────────────
/** Tags that the request-log middleware reads from `res.locals.notes` when the response finishes. */
export function addNote(res: Response, note: string): void {
  const existing: unknown = res.locals.notes
  const notes = Array.isArray(existing) ? (existing as string[]) : []
  if (!notes.includes(note)) notes.push(note)
  res.locals.notes = notes
}

// ─── errors ───────────────────────────────────────────────────────────────────
function requestIdOf(res: Response): string {
  const fromLocals: unknown = res.locals.requestId
  if (typeof fromLocals === 'string' && fromLocals.length > 0) return fromLocals
  const fromHeader = res.getHeader(HDR.requestId)
  if (typeof fromHeader === 'string' && fromHeader.length > 0) return fromHeader
  return newId(8)
}

const AUTO_NOTES: Partial<Record<ApiErrorCode, string>> = {
  unauthorized: 'unauthorized',
  validation_failed: 'validation-failed',
}

/** Sends the uniform error body. Safe to call twice: the second call is ignored once headers went out. */
export function sendError(res: Response, status: number, code: ApiErrorCode, message: string, details?: unknown): void {
  if (res.headersSent) return
  const auto = AUTO_NOTES[code]
  if (auto) addNote(res, auto)
  const body: ApiErrorBody = {
    error: { code, message, requestId: requestIdOf(res), ...(details === undefined ? {} : { details }) },
  }
  // Whatever the header profile says about this path, a failure must never be stored and replayed:
  // under http-cache-trap a 404 or an injected 503 with max-age=60 would outlive the fault that caused it.
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json(body)
}

/** Wraps a handler so thrown `HttpError`s become error bodies; anything else goes to the app error handler. */
export function asyncRoute(handler: (req: Request<RouteParams>, res: Response, next: NextFunction) => unknown): RequestHandler<RouteParams> {
  return (req, res, next) => {
    const fail = (err: unknown): void => {
      if (err instanceof HttpError) sendError(res, err.status, err.code, err.message, err.details)
      else next(err)
    }
    try {
      Promise.resolve(handler(req, res, next)).catch(fail)
    } catch (err) {
      fail(err)
    }
  }
}

/** Parses with a zod schema; failure becomes a 422 whose `details` are the raw zod issues. */
export function validate<S extends z.ZodType>(res: Response, schema: S, data: unknown, label: string): z.output<S> {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  const first = result.error.issues[0]
  const where = first && first.path.length > 0 ? `${first.path.join('.')}: ` : ''
  addNote(res, 'validation-failed')
  throw new HttpError(422, 'validation_failed', `Invalid ${label}. ${where}${first?.message ?? 'Unrecognised input'}`, result.error.issues)
}

// ─── JSON responses ───────────────────────────────────────────────────────────
/** Weak validator derived from the serialised body. */
export function weakEtag(text: string): string {
  const digest = createHash('sha1').update(text).digest('base64url').slice(0, 22)
  return `W/"${Buffer.byteLength(text).toString(16)}-${digest}"`
}

/**
 * True when the request's If-None-Match matches `etag` (weak comparison, `*` matches anything).
 * Not Express' `req.fresh`: fetch() adds `Cache-Control: no-cache` to any request carrying its own
 * If-None-Match, and `fresh` would then refuse to ever answer 304 to exactly the revalidations
 * a service worker makes.
 */
export function ifNoneMatch(req: Request, etag: string | undefined): boolean {
  if (!etag || (req.method !== 'GET' && req.method !== 'HEAD')) return false
  const header = req.get('If-None-Match')
  if (!header) return false
  const strip = (tag: string): string => tag.trim().replace(/^W\//, '')
  const current = strip(etag)
  return header.split(',').some((candidate) => candidate.trim() === '*' || strip(candidate) === current)
}

export interface SendJsonOptions {
  status?: number
  /** A validator to use instead of hashing the body; `false` sends none (and so can never answer 304). */
  etag?: string | false
  /** Value for X-Resource-Rev. */
  rev?: number
}

/**
 * Sends JSON with explicit conditional-request handling. Express' own res.json would
 * generate an ETag and answer 304 silently; doing it here lets us log `etag-304` and choose
 * per response whether a validator exists at all (ping, session, signal and bench must not have one).
 */
export function sendJson(req: Request, res: Response, body: unknown, opts: SendJsonOptions = {}): void {
  const text = JSON.stringify(body)
  res.status(opts.status ?? 200)
  if (opts.rev !== undefined) res.setHeader(HDR.rev, String(opts.rev))
  if (opts.etag !== false) res.setHeader('ETag', opts.etag ?? weakEtag(text))
  if (ifNoneMatch(req, res.getHeader('ETag')?.toString())) {
    addNote(res, 'etag-304')
    res.status(304).end()
    return
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(text))
  res.end(text)
}

/** Weak ETag for a single versioned resource: W/"<id>-r<rev>". */
export function revEtag(id: string, rev: number): string {
  return `W/"${id}-r${rev}"`
}
