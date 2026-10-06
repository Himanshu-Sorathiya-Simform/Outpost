/**
 * The one error type the whole UI understands. Everything that can go wrong — a fetch failure,
 * a bad payload, a render crash, a denied permission, a missing browser API — is normalised into
 * an AppError (see normalize.ts) so screens can react to `kind` instead of string-matching messages.
 */

export const APP_ERROR_KINDS = [
  'offline', // navigator says we are offline and we did not even try
  'network', // fetch() rejected (DNS, socket drop, CORS, SW returned Response.error())
  'timeout', // our own AbortSignal.timeout fired
  'aborted', // caller cancelled (navigation, unmount)
  'unauthorized', // 401
  'forbidden', // 403
  'not-found', // 404
  'conflict', // 409 / 412 — server state moved under us
  'validation', // 400 / 422 — server rejected our input
  'rate-limited', // 429
  'unavailable', // 503 / 502 / 504 from upstream
  'server', // other 5xx
  'http', // any other non-2xx
  'parse', // 2xx but body is not JSON / is empty / is HTML (captive portal, SPA fallback)
  'schema-mismatch', // JSON parsed but failed the zod contract (stale cache, server drift)
  'version-skew', // server demands a newer client / speaks another API version
  'cache-miss', // a cache-only route had nothing (SW answered 504 + X-SW-Source: cache-miss)
  'chunk-load', // dynamic import() failed — classic "new deploy, old tab, or offline on an unvisited route"
  'render', // React error boundary caught it
  'unhandled', // window.onerror / unhandledrejection
  'permission', // Notification / share / clipboard denied (NotAllowedError, SecurityError)
  'unsupported', // the browser lacks the API
  'quota', // QuotaExceededError (Cache Storage / IndexedDB / localStorage)
  'not-implemented', // a src/pwa seam you haven't written yet
  'unknown',
] as const
export type AppErrorKind = (typeof APP_ERROR_KINDS)[number]

export interface AppErrorContext {
  url?: string
  method?: string
  status?: number
  /** Server error code from the uniform error body (ApiErrorBody.error.code). */
  code?: string
  requestId?: string
  /** Seconds, from Retry-After. */
  retryAfterSec?: number
  /** X-Chaos header: which lab rule broke this response. Lets you tell injected failures from real ones. */
  chaos?: string
  /** Free-form: 'route:/log/:id', 'mutation:patch-dispatch', 'seam:badge.set', ... */
  source?: string
  [extra: string]: unknown
}

export interface AppErrorInit {
  kind: AppErrorKind
  message: string
  /** Safe, human copy for the UI. Falls back to DEFAULT_USER_MESSAGE[kind]. */
  userMessage?: string
  retryable?: boolean
  cause?: unknown
  context?: AppErrorContext
}

/** Copy written for operators, not developers. */
export const DEFAULT_USER_MESSAGE: Record<AppErrorKind, string> = {
  offline: 'No signal. This action needs a connection.',
  network: 'Could not reach the relay. Check the connection and try again.',
  timeout: 'The relay took too long to answer.',
  aborted: 'Request cancelled.',
  unauthorized: 'Your shift has lapsed. Clock in again to continue.',
  forbidden: 'You are not cleared for that.',
  'not-found': 'Nothing filed under that reference.',
  conflict: 'Someone changed this while you were looking. Reloaded the latest version.',
  validation: 'The relay rejected the entry. Check the highlighted fields.',
  'rate-limited': 'Too many requests. Wait a moment.',
  unavailable: 'The relay is down for the moment.',
  server: 'The relay hit a fault on its side.',
  http: 'Unexpected reply from the relay.',
  parse: 'The relay answered with something that is not the JSON this screen expects. A captive portal or a stale page may be in the way.',
  'schema-mismatch': 'The data came back in a shape this version of the app does not understand.',
  'version-skew': 'This copy of the app is out of date. Update to keep filing.',
  'cache-miss': 'Not stored for offline use, and there is no signal to fetch it.',
  'chunk-load': 'This screen could not be loaded. It may not be stored for offline use, or a newer version has replaced it.',
  render: 'This screen crashed while drawing itself.',
  unhandled: 'Something failed in the background.',
  permission: 'Permission was denied.',
  unsupported: 'This browser does not support that feature.',
  quota: 'Storage is full on this device.',
  'not-implemented': 'This PWA feature has not been wired up yet.',
  unknown: 'Something went wrong.',
}

/** What this error class teaches you about PWAs. Shown in Lab → Errors. */
export const LEARNING_HINT: Record<AppErrorKind, string> = {
  offline: 'navigator.onLine only knows about the network interface, not the internet. "online" can still be lie-fi.',
  network: 'fetch() rejects only on transport failure. A service worker that calls Response.error(), or a dropped socket, lands here.',
  timeout: 'Without a timeout a flaky connection hangs forever. Network-first strategies need one so the cache fallback can kick in.',
  aborted: 'Not an error to show. Query cancellation on unmount looks like this.',
  unauthorized: 'Never cache authenticated responses in a shared cache without keying them to the session. A cached 401 or a cached "signed out" page is a classic bug.',
  forbidden: 'Fine to show; should not be retried.',
  'not-found': 'Careful: a SPA fallback that answers 200 + index.html for unknown API paths turns a 404 into a parse error.',
  conflict: 'Optimistic UI + stale cache = conflicts. The fix is revalidation (If-Match/ETag), not hoping.',
  validation: 'Replayed background-sync requests can fail validation long after the user left the page. Decide what happens to them.',
  'rate-limited': 'Background sync retries must back off and honour Retry-After, or you will get blocked.',
  unavailable: 'A 503 is a good moment for network-first to serve stale data.',
  server: 'Do not cache 5xx responses. Workbox CacheableResponse exists for this reason.',
  http: 'cache.put() happily stores any status you give it. Decide what is cacheable.',
  parse: 'Captive portals and SPA fallbacks answer 200 text/html. Check content-type before caching a response.',
  'schema-mismatch': 'The cache outlives your deploy. Version your cache names and validate what comes out of them.',
  'version-skew': 'Old tabs and old service workers keep running old code. Servers need a way to say "update now".',
  'cache-miss': 'cache-only is only safe for things you precached at install time.',
  'chunk-load': 'Lazy routes are fetched on demand. Offline + never visited = fails. After a deploy, old hashed chunks are gone from the server.',
  render: 'Error boundaries catch render errors only — not event handlers, not async code.',
  unhandled: 'Promise rejections from service-worker messaging and fetch land here if nobody awaited them.',
  permission: 'Notification.permission "denied" is sticky: you cannot prompt again. Never ask on page load.',
  unsupported: 'Feature-detect, then degrade. iOS Safari, Firefox and desktop Safari miss different subsets.',
  quota: 'Cache Storage and IndexedDB share an origin quota. Eviction can silently drop your "offline" data unless storage is persisted.',
  'not-implemented': 'A seam in src/pwa/ is still a stub. That is the exercise.',
  unknown: 'Unclassified. Add a rule in normalize.ts.',
}

const RETRYABLE: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>(['offline', 'network', 'timeout', 'rate-limited', 'unavailable', 'server', 'cache-miss', 'chunk-load', 'parse'])

export class AppError extends Error {
  readonly kind: AppErrorKind
  readonly userMessage: string
  readonly retryable: boolean
  readonly context: AppErrorContext
  readonly at: string
  readonly id: string

  constructor(init: AppErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = 'AppError'
    this.kind = init.kind
    this.userMessage = init.userMessage ?? DEFAULT_USER_MESSAGE[init.kind]
    this.retryable = init.retryable ?? RETRYABLE.has(init.kind)
    this.context = init.context ?? {}
    this.at = new Date().toISOString()
    this.id = `err-${Math.random().toString(36).slice(2, 8)}${this.at.slice(-6, -1).replace(/\D/g, '')}`
  }

  get hint(): string {
    return LEARNING_HINT[this.kind]
  }

  static is(value: unknown): value is AppError {
    return value instanceof AppError
  }

  toJSON() {
    return { id: this.id, kind: this.kind, message: this.message, userMessage: this.userMessage, retryable: this.retryable, context: this.context, at: this.at }
  }
}
