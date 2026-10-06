/**
 * Fault injection. One middleware, ten failure modes, and a named set of ready-made rules.
 *
 * Semantics (shared/contracts.ts, ChaosRule): the first enabled rule whose method and path prefix
 * match wins. Its latency (latencyMs + U(0..jitterMs)) always applies; then, with `probability`,
 * its `mode` replaces the real response. /api/_lab is never touched.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { HDR, type ApiErrorBody, type ChaosRule, type ChaosState } from '../shared/contracts'
import { isLabPath } from './meta'
import { runtime } from './runtime'
import { sendError } from './util'

// ─── named rules ──────────────────────────────────────────────────────────────
function rule(id: string, label: string, over: Partial<Omit<ChaosRule, 'id' | 'label'>>): ChaosRule {
  return {
    id,
    label,
    enabled: false,
    method: 'ANY',
    pathPrefix: '/api',
    latencyMs: 0,
    jitterMs: 0,
    probability: 1,
    mode: 'pass',
    status: 500,
    retryAfterSec: 5,
    ...over,
  }
}

/**
 * The rules every fresh server starts with, all disabled. Ids are stable: the preset endpoint and the
 * Chaos page refer to them. Labels are what X-Chaos shows, so they stay plain ASCII.
 */
export function defaultRules(): ChaosRule[] {
  return [
    rule('lie-fi', 'Lie-fi (all /api, 4-9 s)', { latencyMs: 4000, jitterMs: 5000 }),
    rule('flaky', 'Flaky API (30% HTTP 500)', { status: 500, mode: 'status', probability: 0.3 }),
    rule('captive-portal', 'Captive portal (HTML 200)', { mode: 'html-200' }),
    rule('slow-8s', 'Slow API (8 s)', { latencyMs: 8000 }),
    rule('corrupt-json', 'Corrupt JSON (200)', { mode: 'corrupt-json' }),
    rule('rate-limited', 'Rate limited (50% HTTP 429)', { mode: 'rate-limit', probability: 0.5, retryAfterSec: 5 }),
    rule('stale-chunks', 'Stale chunks (assets 404)', { pathPrefix: '/assets/', mode: 'status', status: 404 }),
    rule('drop-writes', 'Dropped writes (50% of POST)', { method: 'POST', mode: 'drop', probability: 0.5 }),
    rule('truncate', 'Truncated feed (GET /api/dispatches)', { method: 'GET', pathPrefix: '/api/dispatches', mode: 'truncate-json' }),
    rule('hang-signal', 'Signal board hangs (GET /api/signal)', { method: 'GET', pathPrefix: '/api/signal', mode: 'hang' }),
    // The two modes the named set above would otherwise leave without a one-click rule.
    rule('empty-body', 'Empty 200 (no body)', { mode: 'empty-200' }),
    rule('slow-body', 'Slow body (GET /api, dribbled)', { method: 'GET', mode: 'slow-body' }),
  ]
}

// Registered on import so `resetRuntime()` restores the named rules, and so a fresh process already has them.
runtime.defaultRules = defaultRules
runtime.chaos = { ...runtime.chaos, rules: defaultRules() }

/** Presets that are not just "switch one named rule on/off". */
const SWITCH_PRESETS = ['hard-down', 'schema-drift', 'all-clear'] as const

export const CHAOS_PRESET_NAMES: readonly string[] = [...defaultRules().map((r) => r.id), ...SWITCH_PRESETS]

/**
 * POST /api/_lab/chaos/preset/:name. A rule preset toggles that rule (adding the stock version when
 * the client deleted it); 'hard-down' and 'schema-drift' toggle their switch; 'all-clear' turns
 * everything off. Returns null for an unknown name.
 */
export function applyPreset(state: ChaosState, name: string): ChaosState | null {
  switch (name) {
    case 'hard-down':
      return { ...state, serverOffline: !state.serverOffline }
    case 'schema-drift':
      return { ...state, schemaDrift: !state.schemaDrift }
    case 'all-clear':
      return { serverOffline: false, schemaDrift: false, rules: state.rules.map((r) => ({ ...r, enabled: false })) }
  }
  const stock = defaultRules().find((r) => r.id === name)
  if (!stock) return null
  const existing = state.rules.find((r) => r.id === name)
  if (!existing) return { ...state, rules: [...state.rules, { ...stock, enabled: true }] }
  return { ...state, rules: state.rules.map((r) => (r.id === name ? { ...r, enabled: !r.enabled } : r)) }
}

// ─── matching ─────────────────────────────────────────────────────────────────
function methodMatches(rule: ChaosRule, req: Request): boolean {
  if (rule.method === 'ANY') return true
  // HEAD is a GET without a body: the reachability probe (HEAD /api/ping) must feel a GET rule.
  return (req.method === 'HEAD' ? 'GET' : req.method) === rule.method
}

/** Labels come from the client, and a header value may not hold newlines or non-Latin-1 text. */
function headerSafe(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, '?').slice(0, 120)
}

/** Resolves true after `ms`, or false as soon as the client goes away (so nothing keeps running for a dead socket). */
function wait(res: Response, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const onClose = (): void => {
      clearTimeout(timer)
      resolve(false)
    }
    const timer = setTimeout(() => {
      res.off('close', onClose)
      resolve(true)
    }, ms)
    res.once('close', onClose)
  })
}

// ─── the ten modes ────────────────────────────────────────────────────────────
const HANG_MAX_MS = 120_000

const CAPTIVE_PORTAL = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Guest network sign-in</title></head>
<body><h1>Guest network</h1><p>Accept the terms of use to continue browsing.</p>
<form method="post" action="/accept"><button>Accept and connect</button></form></body></html>
`

/** Parses as far as it goes, then stops making sense: the client gets a full 200 and a body it cannot read. */
const CORRUPT_JSON = '{"items":[{"id":"dp-000064","title":"Barometer falling",,"severity":"notice"},]"nextCursor":null,"total":64,'

/** The first bytes of a plausible dispatch page; the declared length is larger than what follows. */
const TRUNCATED_JSON_HEAD = '{"items":[{"id":"dp-000064","stationId":"st-krn07","stationCode":"KRN-07","title":"Barometer falling, 11 hPa in'

function codeForStatus(status: number): ApiErrorBody['error']['code'] {
  switch (status) {
    case 401:
      return 'unauthorized'
    case 403:
      return 'forbidden'
    case 404:
      return 'not_found'
    case 409:
    case 412:
      return 'conflict'
    case 410:
      return 'gone'
    case 422:
      return 'validation_failed'
    case 429:
      return 'rate_limited'
    case 502:
    case 503:
    case 504:
      return 'unavailable'
    default:
      return status >= 500 ? 'internal' : 'bad_request'
  }
}

function hang(req: Request, res: Response): void {
  // Never answers. Ends when the client gives up (the socket closes) or after two minutes.
  const timer = setTimeout(() => req.socket.destroy(), HANG_MAX_MS)
  res.once('close', () => clearTimeout(timer))
}

function truncateJson(req: Request, res: Response): void {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': '4096' })
  // The socket is closed only after the partial bytes have left, so the client really does start reading a body.
  res.write(TRUNCATED_JSON_HEAD, () => {
    const timer = setTimeout(() => req.socket.destroy(), 25)
    res.once('close', () => clearTimeout(timer))
  })
}

/**
 * Lets the real handler run, but holds its response back and releases it in ~40 small chunks, 150 ms apart.
 * The body is the genuine one, so it parses fine if the client is patient.
 */
function slowBody(req: Request, res: Response, next: NextFunction): void {
  const pieces: Buffer[] = []
  const write = res.write.bind(res)
  const end = res.end.bind(res)

  const collect = (chunk: unknown, encoding: unknown): void => {
    if (typeof chunk === 'string') pieces.push(Buffer.from(chunk, typeof encoding === 'string' && Buffer.isEncoding(encoding) ? encoding : 'utf8'))
    else if (chunk instanceof Uint8Array) pieces.push(Buffer.from(chunk))
  }
  const callbackOf = (...args: unknown[]): (() => void) | undefined => args.find((a): a is () => void => typeof a === 'function')

  res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown): boolean => {
    collect(chunk, encoding)
    const done = callbackOf(encoding, cb)
    if (done) queueMicrotask(done)
    return true
  }) as typeof res.write

  res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown): Response => {
    collect(chunk, encoding)
    res.write = write
    res.end = end
    const body = Buffer.concat(pieces)
    const done = callbackOf(chunk, encoding, cb)
    if (body.length === 0 || req.method === 'HEAD') {
      end(done)
      return res
    }
    const size = Math.max(16, Math.ceil(body.length / 40))
    let offset = 0
    const timer = setInterval(() => {
      if (res.destroyed || res.writableEnded) {
        clearInterval(timer)
        return
      }
      write(body.subarray(offset, offset + size))
      offset += size
      if (offset >= body.length) {
        clearInterval(timer)
        end(done)
      }
    }, 150)
    res.once('close', () => clearInterval(timer))
    return res
  }) as typeof res.end

  next()
}

function inject(rule: ChaosRule, req: Request, res: Response, next: NextFunction): void {
  switch (rule.mode) {
    case 'pass':
      next()
      return
    case 'status':
      sendError(res, rule.status, codeForStatus(rule.status), `Injected failure from chaos rule "${rule.label}".`, { chaosRule: rule.id })
      return
    case 'drop':
      req.socket.destroy()
      return
    case 'hang':
      hang(req, res)
      return
    case 'html-200':
      res.status(200).type('text/html; charset=utf-8').send(CAPTIVE_PORTAL)
      return
    case 'empty-200':
      res.status(200).set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': '0' }).end()
      return
    case 'corrupt-json':
      res.status(200).type('application/json; charset=utf-8').send(CORRUPT_JSON)
      return
    case 'truncate-json':
      truncateJson(req, res)
      return
    case 'slow-body':
      slowBody(req, res, next)
      return
    case 'rate-limit':
      res.setHeader('Retry-After', String(rule.retryAfterSec))
      sendError(res, 429, 'rate_limited', `Too many requests (chaos rule "${rule.label}"). Retry in ${rule.retryAfterSec} s.`, { retryAfterSec: rule.retryAfterSec })
      return
  }
}

async function run(rule: ChaosRule, req: Request, res: Response, next: NextFunction): Promise<void> {
  const delayMs = rule.latencyMs + Math.floor(Math.random() * (rule.jitterMs + 1))
  const fires = rule.mode !== 'pass' && (rule.probability >= 1 || Math.random() < rule.probability)

  // A rule that neither slowed nor broke the request did not touch it, so it leaves no trace.
  if (delayMs > 0 || fires) {
    const label = headerSafe(rule.label)
    res.locals.chaos = label
    res.setHeader(HDR.chaos, label)
    runtime.counters.chaosInjected += 1
  }
  if (delayMs > 0) {
    const stillThere = await wait(res, delayMs)
    if (!stillThere) return
    // X-Served-At should describe when the answer was produced, not when the request arrived.
    res.setHeader(HDR.servedAt, new Date().toISOString())
  }
  if (fires) inject(rule, req, res, next)
  else next()
}

export const chaosMiddleware: RequestHandler = (req, res, next) => {
  if (isLabPath(req.path)) {
    next()
    return
  }
  const { serverOffline, rules } = runtime.chaos
  if (serverOffline) {
    res.locals.chaos = 'server-offline'
    runtime.counters.chaosInjected += 1
    req.socket.destroy()
    return
  }
  const matched = rules.find((r) => r.enabled && methodMatches(r, req) && req.path.startsWith(r.pathPrefix))
  if (!matched) {
    next()
    return
  }
  run(matched, req, res, next).catch((err: unknown) => {
    if (res.headersSent) req.socket.destroy()
    else next(err)
  })
}
