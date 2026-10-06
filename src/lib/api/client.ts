import type { z } from 'zod'
import { ApiErrorBody, HDR } from '@shared/contracts'
import { AppError, type AppErrorContext, type AppErrorKind } from '@/lib/errors/app-error'
import { errorCenter } from '@/lib/errors/center'
import { formatZodIssues, isBrowserOffline, toAppError } from '@/lib/errors/normalize'
import { noteApiFailure, noteApiReachable } from '@/lib/net/status'
import { getLabSettings } from '@/lib/settings/lab-settings'
import { getTabId } from '@/lib/tabs/tab-sync'
import { useNetLog } from './net-log'
import { decideSource, findResourceTiming, hasServiceWorkerController, type Provenance, type TimingInfo } from './provenance'
import type { ApiResult, ResponseMeta } from './types'

export type ApiMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type QueryValue = string | number | boolean | null | undefined

export interface ApiRequest<T> {
  method?: ApiMethod
  /** Path without origin, e.g. '/api/dispatches'. */
  path: string
  /** `undefined` and `null` values are skipped; keys are sorted so equal queries produce equal URLs (and equal cache keys). */
  query?: Record<string, QueryValue>
  /** Serialised as JSON. */
  body?: unknown
  /** Every response is validated with this. A failure is a 'schema-mismatch' AppError. */
  schema: z.ZodType<T>
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Defaults to the lab setting `requestTimeoutMs`. 0 disables the timeout. */
  timeoutMs?: number
  /** Sent as If-Match (pass the ETag verbatim, quotes included). */
  ifMatch?: string
  /** Sent as Idempotency-Key. */
  idempotencyKey?: string
  cache?: RequestCache
  /**
   * An empty body (204, or 200 with nothing in it) is acceptable. The schema then receives `undefined`,
   * so pass e.g. `z.undefined()` for endpoints that answer 204.
   */
  allowEmpty?: boolean
  /** Set false for instrumentation calls that should not show up in the client network log. Default true. */
  netLog?: boolean
}

// ─── small pure helpers (exported for tests) ──────────────────────────────────

export function buildPath(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path
  const entries = Object.entries(query)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  if (entries.length === 0) return path
  const search = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
  return `${path}${path.includes('?') ? '&' : '?'}${search}`
}

/** Retry-After is either delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - now) / 1000))
}

export function kindForStatus(status: number, swSource: string | null = null): AppErrorKind {
  if (status === 504 && swSource === 'cache-miss') return 'cache-miss'
  switch (status) {
    case 401:
      return 'unauthorized'
    case 403:
      return 'forbidden'
    case 404:
      return 'not-found'
    case 409:
    case 412:
      return 'conflict'
    case 400:
    case 422:
      return 'validation'
    case 426:
      return 'version-skew'
    case 429:
      return 'rate-limited'
    case 502:
    case 503:
    case 504:
      return 'unavailable'
    default:
      return status >= 500 ? 'server' : 'http'
  }
}

/** Merges the caller's signal with our own timeout. AbortSignal.any where it exists, a manual relay elsewhere. */
export function combineSignals(signals: readonly AbortSignal[]): { signal: AbortSignal; dispose: () => void } {
  if (typeof AbortSignal.any === 'function') return { signal: AbortSignal.any([...signals]), dispose: () => undefined }
  const controller = new AbortController()
  const relays = signals.map((source) => {
    const relay = (): void => controller.abort(source.reason)
    if (source.aborted) relay()
    else source.addEventListener('abort', relay, { once: true })
    return () => source.removeEventListener('abort', relay)
  })
  return { signal: controller.signal, dispose: () => relays.forEach((off) => off()) }
}

interface RequestSignal {
  signal: AbortSignal | undefined
  /** True only when OUR timer fired before anything else aborted the request. */
  timedOut(): boolean
  dispose(): void
}

function createRequestSignal(caller: AbortSignal | undefined, timeoutMs: number): RequestSignal {
  let timedOut = false
  const timeoutController = timeoutMs > 0 ? new AbortController() : null
  const timer = timeoutController
    ? setTimeout(() => {
        if (caller?.aborted) return
        timedOut = true
        timeoutController.abort(new DOMException(`No response within ${timeoutMs} ms`, 'TimeoutError'))
      }, timeoutMs)
    : null

  const sources = [caller, timeoutController?.signal].filter((s): s is AbortSignal => s !== undefined)
  const combined = sources.length > 1 ? combineSignals(sources) : null
  return {
    signal: combined?.signal ?? sources[0],
    timedOut: () => timedOut,
    dispose: () => {
      if (timer) clearTimeout(timer)
      combined?.dispose()
    },
  }
}

const utf8Length = (text: string): number => new TextEncoder().encode(text).length

function toFinite(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'syntax error' }
  }
}

// ─── API version observers ────────────────────────────────────────────────────

type ApiVersionObserver = (apiVersion: number) => void
const apiVersionObservers = new Set<ApiVersionObserver>()

/** The version watcher subscribes here to learn which API version the server speaks (X-Api-Version), from any response. */
export function observeApiVersion(observer: ApiVersionObserver): () => void {
  apiVersionObservers.add(observer)
  return () => {
    apiVersionObservers.delete(observer)
  }
}

// ─── the client ───────────────────────────────────────────────────────────────

interface Exchange {
  res: Response
  text: string
  startedPerf: number
  endedPerf: number
  path: string
}

/**
 * The caller's signal fired. A signal made with AbortSignal.timeout() carries a TimeoutError reason: that is the
 * caller's own deadline passing, which is a timeout, not a cancellation nobody needs to hear about.
 */
function callerStop(caller: AbortSignal | undefined, phase: string, context: AppErrorContext, cause?: unknown): AppError {
  const reason: unknown = caller?.aborted ? caller.reason : undefined
  // Duck-typed: a DOMException from another realm (an iframe, jsdom) is not `instanceof Error` here.
  if (typeof reason === 'object' && reason !== null && 'name' in reason && reason.name === 'TimeoutError') {
    return new AppError({ kind: 'timeout', message: `The caller's own deadline passed (${phase})`, cause: cause ?? reason, context: { ...context, phase } })
  }
  return new AppError({ kind: 'aborted', message: `Request aborted (${phase})`, cause: cause ?? reason, context: { ...context, phase } })
}

/** Everything fetch() or reading the body can throw is transport failure, a timeout or a cancellation. */
function classifyTransportFailure(err: unknown, signal: RequestSignal, caller: AbortSignal | undefined, phase: 'fetch' | 'body', context: AppErrorContext, timeoutMs: number): AppError {
  if (AppError.is(err)) return err
  const detail = err instanceof Error ? err.message : String(err)
  if (signal.timedOut()) {
    return new AppError({ kind: 'timeout', message: `No response within ${timeoutMs} ms (${phase})`, cause: err, context: { ...context, phase, timeoutMs } })
  }
  if (caller?.aborted || (err instanceof Error && err.name === 'AbortError')) {
    return callerStop(caller, phase, context, err)
  }
  const offline = isBrowserOffline()
  const message = phase === 'body' ? `Connection lost while reading the response body: ${detail}` : `fetch() rejected: ${detail}`
  return new AppError({ kind: offline ? 'offline' : 'network', message, cause: err, context: { ...context, phase } })
}

async function exchange<T>(req: ApiRequest<T>, method: ApiMethod, path: string, context: AppErrorContext, startedPerf: number): Promise<Exchange> {
  const timeoutMs = req.timeoutMs ?? getLabSettings().requestTimeoutMs
  const signal = createRequestSignal(req.signal, timeoutMs)
  try {
    if (req.signal?.aborted) throw callerStop(req.signal, 'before send', context)

    const headers = new Headers({ Accept: 'application/json', [HDR.tab]: getTabId(), ...req.headers })
    if (req.body !== undefined) headers.set('Content-Type', 'application/json')
    if (req.ifMatch) headers.set('If-Match', req.ifMatch)
    if (req.idempotencyKey) headers.set(HDR.idempotency, req.idempotencyKey)

    let res: Response
    try {
      // navigator.onLine is deliberately not consulted: a service worker may answer while the network is down.
      res = await fetch(path, {
        method,
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        credentials: 'same-origin',
        cache: req.cache,
        signal: signal.signal,
      })
    } catch (err) {
      throw classifyTransportFailure(err, signal, req.signal, 'fetch', context, timeoutMs)
    }

    // A worker's Response.error() normally makes fetch() reject, but a response of type 'error' is a transport
    // failure whichever way it arrives; it must never be read as "HTTP 0".
    if (res.type === 'error') throw classifyTransportFailure(new TypeError('Network error (response type "error")'), signal, req.signal, 'fetch', context, timeoutMs)

    // The body is read exactly once, as text, so HTML / empty / truncated bodies can each get a precise error.
    let text: string
    try {
      text = method === 'HEAD' ? '' : await res.text()
    } catch (err) {
      throw classifyTransportFailure(err, signal, req.signal, 'body', { ...context, status: res.status }, timeoutMs)
    }
    return { res, text, startedPerf, endedPerf: performance.now(), path }
  } finally {
    signal.dispose()
  }
}

function resolveUrl(path: string): string {
  try {
    return new URL(path, typeof location === 'undefined' ? 'http://localhost' : location.href).href
  } catch {
    return path
  }
}

/** The resource-timing entry is sometimes queued a task after the body resolves; allow exactly one tick for it. */
async function lookupTiming(finalUrl: string, ex: Exchange): Promise<TimingInfo | null> {
  const first = findResourceTiming(finalUrl, ex.startedPerf, ex.endedPerf)
  if (first || typeof performance.getEntriesByName !== 'function') return first
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  return findResourceTiming(finalUrl, ex.startedPerf, performance.now())
}

function relativeUrl(res: Response, requested: string): string {
  if (!res.url) return requested
  try {
    const u = new URL(res.url)
    return u.origin === location.origin ? `${u.pathname}${u.search}` : res.url
  } catch {
    return requested
  }
}

function buildMeta(ex: Exchange, method: ApiMethod, timing: TimingInfo | null, provenance: Provenance): ResponseMeta {
  const { res } = ex
  const h = (name: string): string | null => res.headers.get(name)
  const fetchedAtMs = Date.now()
  const servedAt = h(HDR.servedAt)
  const servedMs = servedAt ? Date.parse(servedAt) : Number.NaN
  return {
    url: relativeUrl(res, ex.path),
    method,
    status: res.status,
    requestId: h(HDR.requestId),
    servedAt,
    servedBy: h(HDR.servedBy),
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    durationMs: Math.round(ex.endedPerf - ex.startedPerf),
    source: provenance.source,
    sourceReason: provenance.reason,
    // Clamped: the server's clock may run slightly ahead of ours, and "-40 ms old" helps nobody.
    dataAgeMs: Number.isNaN(servedMs) ? null : Math.max(0, fetchedAtMs - servedMs),
    etag: h('ETag'),
    cacheControl: h('Cache-Control'),
    ageHeader: toFinite(h('Age')),
    rev: toFinite(h(HDR.rev)),
    apiVersion: toFinite(h(HDR.apiVersion)),
    chaos: h(HDR.chaos),
    swSource: h(HDR.swSource),
    swStrategy: h(HDR.swStrategy),
    swCache: h(HDR.swCache),
    swCachedAt: h(HDR.swCachedAt),
    bytes: timing && timing.decodedBodySize > 0 ? timing.decodedBodySize : utf8Length(ex.text),
    transferSize: timing?.transferSize ?? null,
    deliveryType: timing ? timing.deliveryType : null,
    redirected: res.redirected,
    responseType: res.type,
  }
}

/** Turns a non-2xx response into an AppError, decoding the server's uniform error body when there is one. */
function httpError(ex: Exchange, method: ApiMethod): AppError {
  const { res, text } = ex
  const swSource = res.headers.get(HDR.swSource)
  const kind = kindForStatus(res.status, swSource)
  const parsed = parseJson(text)
  const body = parsed.ok ? ApiErrorBody.safeParse(parsed.value) : null
  const serverError = body?.success ? body.data.error : null
  const context: AppErrorContext = {
    url: ex.path,
    method,
    status: res.status,
    requestId: serverError?.requestId ?? res.headers.get(HDR.requestId) ?? undefined,
    code: serverError?.code,
    details: serverError?.details,
    retryAfterSec: parseRetryAfter(res.headers.get('Retry-After')),
    chaos: res.headers.get(HDR.chaos) ?? undefined,
    swSource: swSource ?? undefined,
  }
  const message = serverError?.message ?? `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`
  return new AppError({ kind, message, context })
}

/** A 2xx response that is not usable JSON: empty, HTML, wrong type, or garbled. */
function parseError(ex: Exchange, method: ApiMethod, detail: string, extra?: AppErrorContext): AppError {
  const contentType = ex.res.headers.get('Content-Type')
  return new AppError({
    kind: 'parse',
    message: detail,
    context: { url: ex.path, method, status: ex.res.status, requestId: ex.res.headers.get(HDR.requestId) ?? undefined, contentType, chaos: ex.res.headers.get(HDR.chaos) ?? undefined, ...extra },
  })
}

function decode<T>(ex: Exchange, method: ApiMethod, req: ApiRequest<T>): T {
  const { res, text } = ex
  const contentType = res.headers.get('Content-Type')
  const ctLabel = contentType ? `"${contentType}"` : 'no content-type'

  if (res.status === 204 || text.trim() === '') {
    if (!req.allowEmpty) throw parseError(ex, method, `Empty response body (HTTP ${res.status}, ${ctLabel}) where JSON was expected`)
    return validate(req.schema, undefined, ex, method)
  }

  const looksLikeHtml = /html/i.test(contentType ?? '') || /^\s*</.test(text)
  if (!/json/i.test(contentType ?? '')) {
    if (looksLikeHtml) {
      throw parseError(ex, method, `Expected JSON but received ${ctLabel}. The body looks like a captive portal or SPA fallback page.`, { snippet: text.slice(0, 120) })
    }
    throw parseError(ex, method, `Expected JSON but received ${ctLabel}`, { snippet: text.slice(0, 120) })
  }

  const parsed = parseJson(text)
  if (!parsed.ok) throw parseError(ex, method, `Response body is not valid JSON (${parsed.reason}); content-type ${ctLabel}`, { snippet: text.slice(0, 120) })
  return validate(req.schema, parsed.value, ex, method)
}

function validate<T>(schema: z.ZodType<T>, value: unknown, ex: Exchange, method: ApiMethod): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const issues = formatZodIssues(result.error.issues)
  throw new AppError({
    kind: 'schema-mismatch',
    message: `Response from ${method} ${ex.path} does not match its contract: ${issues[0] ?? 'unknown issue'}`,
    cause: result.error,
    context: {
      url: ex.path,
      method,
      status: ex.res.status,
      requestId: ex.res.headers.get(HDR.requestId) ?? undefined,
      issues,
      apiVersion: toFinite(ex.res.headers.get(HDR.apiVersion)) ?? undefined,
      chaos: ex.res.headers.get(HDR.chaos) ?? undefined,
    },
  })
}

function announceApiVersion(res: Response): void {
  const version = toFinite(res.headers.get(HDR.apiVersion))
  if (version === null) return
  for (const observe of apiVersionObservers) {
    try {
      observe(version)
    } catch (err) {
      // An observer is instrumentation: its bug must not turn a good response into a failed request.
      errorCenter.report(err, { source: 'api-version-observer', silent: true })
    }
  }
}

/**
 * The only function in the app that fetches app data. Resolves with validated data plus provenance metadata,
 * or throws an AppError — never anything else. See docs/ARCHITECTURE.md "Client foundation spec".
 */
export async function apiFetch<T>(req: ApiRequest<T>): Promise<ApiResult<T>> {
  const method = req.method ?? 'GET'
  const path = buildPath(req.path, req.query)
  const context: AppErrorContext = { url: path, method }
  const startedAt = Date.now()
  const startedPerf = performance.now()
  const log = req.netLog !== false ? useNetLog.getState().record : () => undefined

  let ex: Exchange | null = null
  try {
    ex = await exchange(req, method, path, context, startedPerf)
    announceApiVersion(ex.res)

    if (ex.res.status < 200 || ex.res.status > 299) throw httpError(ex, method)

    const data = decode(ex, method, req)
    const timing = await lookupTiming(ex.res.url || resolveUrl(path), ex)
    const provenance = decideSource({ swSource: ex.res.headers.get(HDR.swSource), timing, hasController: hasServiceWorkerController() })
    const meta = buildMeta(ex, method, timing, provenance)

    log({ startedAt, method, url: path, status: meta.status, durationMs: meta.durationMs, source: meta.source, errorKind: null, requestId: meta.requestId, chaos: meta.chaos, bytes: meta.bytes })
    // Only a response that really came from the server proves the server is up.
    if (meta.source === 'network' || meta.source === 'sw-network') noteApiReachable()
    return { data, meta }
  } catch (thrown) {
    const error = toAppError(thrown, context)
    const res = ex?.res ?? null
    const provenance = res ? decideSource({ swSource: res.headers.get(HDR.swSource), timing: null, hasController: hasServiceWorkerController() }) : null
    log({
      startedAt,
      method,
      url: path,
      status: res?.status ?? 0,
      durationMs: Math.round((ex?.endedPerf ?? performance.now()) - startedPerf),
      source: provenance?.source ?? null,
      errorKind: error.kind,
      requestId: error.context.requestId ?? null,
      chaos: error.context.chaos ?? null,
      bytes: null,
    })
    noteApiFailure(error.kind)
    throw error
  }
}
