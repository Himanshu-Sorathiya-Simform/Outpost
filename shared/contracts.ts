/**
 * Shared API contracts — the single source of truth for server AND client.
 *
 * Rules:
 *  - No DOM, no Node imports here (this file is compiled by both tsconfigs).
 *  - The server builds responses that satisfy these schemas; the client parses every
 *    response with them. A parse failure on the client is a `schema-mismatch` AppError —
 *    which is exactly what happens when a stale service-worker cache serves an old shape.
 */
import { z } from 'zod'

/** Bumped by the lab "schema drift" switch to simulate a server that shipped a breaking change. */
export const API_VERSION = 1

const iso = z.iso.datetime()

// ─── Headers ──────────────────────────────────────────────────────────────────
export const HDR = {
  // set by the server on every response
  requestId: 'X-Request-Id',
  servedAt: 'X-Served-At',
  servedBy: 'X-Served-By',
  apiVersion: 'X-Api-Version',
  rev: 'X-Resource-Rev',
  chaos: 'X-Chaos', // label of the chaos rule that touched this response
  // set by the client on every request from the app
  tab: 'X-Tab-Id',
  idempotency: 'Idempotency-Key',
  // OPTIONAL convention for YOUR service worker: stamp these on responses it produces so the
  // Lab UI can show provenance. The app reads them if present and works fine without them.
  swSource: 'X-SW-Source', // 'cache' | 'network' | 'cache-miss' | 'fallback' | 'revalidated'
  swStrategy: 'X-SW-Strategy', // 'cache-first' | 'network-first' | ...
  swCache: 'X-SW-Cache', // cache name, e.g. 'api-v3'
  swCachedAt: 'X-SW-Cached-At', // ISO time the entry was written
} as const

// ─── Domain ───────────────────────────────────────────────────────────────────
export const Severity = z.enum(['routine', 'notice', 'urgent', 'critical'])
export type Severity = z.infer<typeof Severity>
export const SEVERITIES = Severity.options

export const StationKind = z.enum(['weather', 'seismic', 'radio-relay', 'glacier', 'coastal'])
export type StationKind = z.infer<typeof StationKind>
export const StationStatus = z.enum(['online', 'degraded', 'dark'])
export type StationStatus = z.infer<typeof StationStatus>

export const Coords = z.object({ lat: z.number(), lng: z.number() })
export type Coords = z.infer<typeof Coords>

export const Station = z.object({
  id: z.string(), // 'st-krn07'
  code: z.string(), // 'KRN-07'
  name: z.string(),
  region: z.string(),
  kind: StationKind,
  status: StationStatus,
  lat: z.number(),
  lng: z.number(),
  elevationM: z.number(),
  crew: z.number().int(),
  lastContactAt: iso,
  blurb: z.string(),
  rev: z.number().int(),
})
export type Station = z.infer<typeof Station>
export const StationList = z.object({ items: z.array(Station), asOf: iso })
export type StationList = z.infer<typeof StationList>

export const Dispatch = z.object({
  id: z.string(), // 'dp-000123'
  stationId: z.string(),
  stationCode: z.string(),
  title: z.string(),
  body: z.string(),
  severity: Severity,
  tags: z.array(z.string()),
  filedAt: iso,
  filedBy: z.string(), // operator callsign
  coords: Coords.nullable(),
  imageUrl: z.string(), // '/media/dispatch/dp-000123.svg'
  read: z.boolean(),
  acked: z.boolean(),
  starred: z.boolean(),
  rev: z.number().int(), // per-item revision. ETag is W/"<id>-r<rev>"
  clientId: z.string().nullable(), // Idempotency-Key of the client that created it
})
export type Dispatch = z.infer<typeof Dispatch>

export const DispatchPage = z.object({
  items: z.array(Dispatch),
  nextCursor: z.string().nullable(),
  total: z.number().int(), // total matching the filters
  feedRev: z.number().int(), // bumps whenever ANY dispatch is created/changed
})
export type DispatchPage = z.infer<typeof DispatchPage>

/** Query string for GET /api/dispatches */
export const DispatchFilters = z.object({
  severity: Severity.optional(),
  station: z.string().optional(), // station code or id
  q: z.string().optional(),
  unread: z.boolean().optional(),
  starred: z.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
})
export type DispatchFilters = z.infer<typeof DispatchFilters>

export const DispatchCreate = z.object({
  clientId: z.string().min(8), // also sent as Idempotency-Key
  stationId: z.string(),
  title: z.string().min(3).max(120),
  body: z.string().min(1).max(4000),
  severity: Severity,
  tags: z.array(z.string().max(24)).max(8).default([]),
  coords: Coords.nullable().default(null),
  /** When the operator actually wrote it (offline drafts can be hours old). */
  filedAtClient: iso.optional(),
})
export type DispatchCreate = z.input<typeof DispatchCreate>

export const DispatchPatch = z
  .object({ read: z.boolean().optional(), acked: z.boolean().optional(), starred: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Patch must change at least one field' })
export type DispatchPatch = z.infer<typeof DispatchPatch>

export const InboxSummary = z.object({
  unread: z.number().int(),
  urgentUnread: z.number().int(), // urgent + critical
  total: z.number().int(),
  feedRev: z.number().int(),
  asOf: iso,
})
export type InboxSummary = z.infer<typeof InboxSummary>

export const SignalReading = z.object({
  stationId: z.string(),
  stationCode: z.string(),
  status: StationStatus,
  rssiDbm: z.number(),
  snrDb: z.number(),
  latencyMs: z.number(),
  batteryPct: z.number(),
  tempC: z.number(),
  windKph: z.number(),
})
export type SignalReading = z.infer<typeof SignalReading>
export const SignalBoard = z.object({
  seq: z.number().int(), // increments on every request — a cached copy is instantly recognisable
  sampledAt: iso,
  readings: z.array(SignalReading),
})
export type SignalBoard = z.infer<typeof SignalBoard>

export const HandbookBlock = z.discriminatedUnion('type', [
  z.object({ type: z.literal('h'), text: z.string() }),
  z.object({ type: z.literal('p'), text: z.string() }),
  z.object({ type: z.literal('ul'), items: z.array(z.string()) }),
  z.object({ type: z.literal('callout'), tone: z.enum(['note', 'warn']), text: z.string() }),
  z.object({ type: z.literal('code'), text: z.string() }),
])
export type HandbookBlock = z.infer<typeof HandbookBlock>
export const HandbookChapterMeta = z.object({
  slug: z.string(),
  number: z.number().int(),
  title: z.string(),
  summary: z.string(),
  readMinutes: z.number().int(),
})
export type HandbookChapterMeta = z.infer<typeof HandbookChapterMeta>
export const HandbookIndex = z.object({
  edition: z.string(), // '1988.4' — the handbook only changes when the lab "release" bumps it
  updatedAt: iso,
  chapters: z.array(HandbookChapterMeta),
})
export type HandbookIndex = z.infer<typeof HandbookIndex>
export const HandbookChapter = HandbookChapterMeta.extend({
  edition: z.string(),
  blocks: z.array(HandbookBlock),
})
export type HandbookChapter = z.infer<typeof HandbookChapter>

export const Digest = z.object({
  generatedAt: iso,
  since: iso.nullable(),
  newCount: z.number().int(),
  urgentCount: z.number().int(),
  unread: z.number().int(),
  items: z.array(Dispatch), // newest first, max 20
})
export type Digest = z.infer<typeof Digest>

export const VersionInfo = z.object({
  server: z.string(), // server build, e.g. '1.0.0'
  api: z.number().int(), // API_VERSION the server speaks
  latestClient: z.string(), // newest client the server knows of (semver)
  minClient: z.string(), // clients older than this MUST upgrade (semver) -> version-skew AppError
  serverInstance: z.string(), // changes on every server restart
  startedAt: iso,
  now: iso,
})
export type VersionInfo = z.infer<typeof VersionInfo>

// ─── Session (cookie: outpost_sid, HttpOnly, SameSite=Lax) ─────────────────────
export const Operator = z.object({ callsign: z.string(), displayName: z.string() })
export const Session = z.object({ operator: Operator, issuedAt: iso, expiresAt: iso })
export type Session = z.infer<typeof Session>
export const SessionResponse = z.object({ session: Session.nullable() })
export type SessionResponse = z.infer<typeof SessionResponse>
export const SessionCreate = z.object({ callsign: z.string().regex(/^[A-Za-z0-9-]{2,16}$/, 'Callsign: 2–16 letters, digits or dashes') })
export type SessionCreate = z.infer<typeof SessionCreate>

// ─── Strategy bench ───────────────────────────────────────────────────────────
export const BENCH_STRATEGIES = ['cache-first', 'network-first', 'stale-while-revalidate', 'network-only', 'cache-only'] as const
export const BenchStrategy = z.enum(BENCH_STRATEGIES)
export type BenchStrategy = z.infer<typeof BenchStrategy>
/** 'delta' is the "never precache this one" key — use it to provoke a cache-only miss. */
export const BENCH_KEYS = ['alpha', 'beta', 'gamma', 'delta'] as const
export type BenchKey = (typeof BENCH_KEYS)[number]

export const BenchResponse = z.object({
  strategy: BenchStrategy,
  key: z.string(),
  rev: z.number().int(), // bumped by POST .../bump — "the truth changed on the server"
  hits: z.number().int(), // how many times THE SERVER has answered this key (a cache hit never increments it)
  servedAt: iso,
  serverInstance: z.string(),
  requestId: z.string(),
  payload: z.object({ label: z.string(), sample: z.number() }), // sample: deterministic per (key, rev)
})
export type BenchResponse = z.infer<typeof BenchResponse>

// ─── Chaos (server-side fault injection) ──────────────────────────────────────
export const ChaosMode = z.enum([
  'pass', // latency only
  'status', // respond with `status` and an error JSON body
  'drop', // destroy the socket -> fetch() rejects with TypeError
  'hang', // never respond (until client aborts / 120 s)
  'html-200', // 200 text/html "captive portal" page where JSON was expected
  'empty-200', // 200 with zero-length body
  'corrupt-json', // 200 application/json with syntactically broken body
  'truncate-json', // valid JSON start, socket destroyed midway
  'slow-body', // body dribbled out in small chunks
  'rate-limit', // 429 + Retry-After
])
export type ChaosMode = z.infer<typeof ChaosMode>
export const ChaosRule = z.object({
  id: z.string(),
  label: z.string(),
  enabled: z.boolean(),
  method: z.enum(['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  /** Matches req.path startsWith. Applies to ANY path except /api/_lab (e.g. '/assets/', '/media/', '/api/bench/cache-first'). */
  pathPrefix: z.string(),
  latencyMs: z.number().int().min(0).max(60_000),
  jitterMs: z.number().int().min(0).max(60_000),
  /** 0..1 chance that `mode` fires (latency always applies). */
  probability: z.number().min(0).max(1),
  mode: ChaosMode,
  status: z.number().int().min(400).max(599), // for mode 'status'
  retryAfterSec: z.number().int().min(0).max(3600), // for mode 'rate-limit'
})
export type ChaosRule = z.infer<typeof ChaosRule>
export const ChaosState = z.object({
  /** Every non-lab request has its socket destroyed. A "server is down" switch that doesn't touch DevTools. */
  serverOffline: z.boolean(),
  /** Dispatch payloads switch to the drifted shape below. */
  schemaDrift: z.boolean(),
  rules: z.array(ChaosRule), // first enabled matching rule wins
})
export type ChaosState = z.infer<typeof ChaosState>

/** What a dispatch looks like when schemaDrift is on (client's zod schema MUST reject this). */
export const DriftedDispatch = z.object({
  id: z.string(),
  station_id: z.string(),
  title: z.string(),
  body: z.string(),
  level: z.number().int().min(1).max(4), // replaces `severity`
  filed_at: iso, // replaces `filedAt`
})

export const HeaderProfile = z.enum([
  'realistic', // index.html/sw.js/manifest: no-cache · /assets/*: immutable 1y · /media: 1d · API: no-cache + ETag
  'no-store', // Cache-Control: no-store on everything (the SW cache is the ONLY cache)
  'http-cache-trap', // index.html + sw.js + manifest: max-age=1y (the classic "my SW never updates" bug) · API: max-age=60
])
export type HeaderProfile = z.infer<typeof HeaderProfile>

export const WireState = z.object({
  auto: z.boolean(), // server spontaneously files new dispatches
  everySec: z.number().int().min(2).max(3600),
  pushOnNew: z.boolean(), // also send a push to every subscription for every newly created dispatch (wire-generated or filed through POST /api/dispatches)
})
export type WireState = z.infer<typeof WireState>

export const ReleaseState = z.object({
  latestClient: z.string(),
  minClient: z.string(),
  api: z.number().int(),
  handbookEdition: z.string(),
})
export type ReleaseState = z.infer<typeof ReleaseState>

export const LabCounters = z.object({
  requests: z.number().int(),
  chaosInjected: z.number().int(),
  dispatches: z.number().int(),
  pushSent: z.number().int(),
  subscriptions: z.number().int(),
  sessions: z.number().int(),
})
export const LabState = z.object({
  serverInstance: z.string(),
  startedAt: iso,
  chaos: ChaosState,
  wire: WireState,
  release: ReleaseState,
  headerProfile: HeaderProfile,
  sessionTtlSec: z.number().int(),
  counters: LabCounters,
})
export type LabState = z.infer<typeof LabState>

/** GET /api/_lab/truth — what the server believes RIGHT NOW, bypassing nothing (it's just never cached because nobody routes it). */
export const LabTruth = z.object({
  asOf: iso,
  feedRev: z.number().int(),
  inbox: InboxSummary,
  dispatches: z.array(z.object({ id: z.string(), rev: z.number().int(), read: z.boolean(), acked: z.boolean(), starred: z.boolean() })),
  stations: z.array(z.object({ id: z.string(), rev: z.number().int() })),
  bench: z.array(z.object({ strategy: BenchStrategy, key: z.string(), rev: z.number().int(), hits: z.number().int() })),
  handbookEdition: z.string(),
  session: Session.nullable(),
})
export type LabTruth = z.infer<typeof LabTruth>

export const RequestLogEntry = z.object({
  seq: z.number().int(),
  ts: iso,
  method: z.string(),
  path: z.string(), // including query string
  status: z.number().int(), // 0 = socket dropped / hung / client gone
  durationMs: z.number(),
  bytes: z.number().int(),
  requestId: z.string(),
  dest: z.string().nullable(), // Sec-Fetch-Dest
  mode: z.string().nullable(), // Sec-Fetch-Mode
  site: z.string().nullable(), // Sec-Fetch-Site
  tab: z.string().nullable(), // X-Tab-Id (absent when the request did not originate from app code — e.g. a service worker building its own Request)
  chaos: z.string().nullable(), // rule label or 'server-offline'
  notes: z.array(z.string()), // 'etag-304', 'idempotent-replay', 'if-match-412', 'unauthorized', ...
  reqHeaders: z.record(z.string(), z.string()), // if-none-match, if-match, idempotency-key, cache-control, range, purpose
})
export type RequestLogEntry = z.infer<typeof RequestLogEntry>
export const RequestLogPage = z.object({ entries: z.array(RequestLogEntry), lastSeq: z.number().int() })
export type RequestLogPage = z.infer<typeof RequestLogPage>

/** Server-sent events on GET /api/_lab/events */
export const LabEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), serverInstance: z.string() }),
  z.object({ type: z.literal('log'), entry: RequestLogEntry }),
  z.object({ type: z.literal('state'), state: LabState }),
  z.object({ type: z.literal('wire'), dispatchId: z.string(), severity: Severity, title: z.string() }),
  z.object({ type: z.literal('push'), attempted: z.number().int(), delivered: z.number().int(), title: z.string() }),
])
export type LabEvent = z.infer<typeof LabEvent>

// ─── Push ─────────────────────────────────────────────────────────────────────
export const PushKind = z.enum(['dispatch', 'custom', 'silent-badge', 'sync-poke'])
export type PushKind = z.infer<typeof PushKind>
export const PushAction = z.object({ action: z.string(), title: z.string() })

/** Exactly what arrives in `event.data.json()` inside your service worker's `push` handler. */
export const PushPayload = z.object({
  v: z.literal(1),
  kind: PushKind,
  title: z.string(),
  body: z.string(),
  url: z.string(), // where notificationclick should navigate, e.g. '/log/dp-000123'
  tag: z.string().nullable(),
  dispatchId: z.string().nullable(),
  badgeCount: z.number().int().nullable(), // null = leave the badge alone
  icon: z.string(),
  image: z.string().nullable(),
  actions: z.array(PushAction),
  requireInteraction: z.boolean(),
  silent: z.boolean(), // true for 'silent-badge' / 'sync-poke': update state, don't call showNotification
  sentAt: iso,
})
export type PushPayload = z.infer<typeof PushPayload>

export const PushSubscriptionJson = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
})
export type PushSubscriptionJson = z.infer<typeof PushSubscriptionJson>
export const PushSubscribeRequest = z.object({ subscription: PushSubscriptionJson, label: z.string().max(60).optional() })
export type PushSubscribeRequest = z.infer<typeof PushSubscribeRequest>
export const PushVapid = z.object({ publicKey: z.string() })
export const PushSubscriptionInfo = z.object({
  id: z.string(),
  endpointHost: z.string(), // e.g. 'fcm.googleapis.com'
  endpointTail: z.string(), // last 12 chars, to tell subscriptions apart
  label: z.string().nullable(),
  createdAt: iso,
  lastResult: z.enum(['never', 'ok', 'failed']),
})
export type PushSubscriptionInfo = z.infer<typeof PushSubscriptionInfo>
export const PushSendRequest = z.object({
  kind: PushKind.default('custom'),
  title: z.string().max(120).optional(),
  body: z.string().max(400).optional(),
  url: z.string().optional(),
  tag: z.string().optional(),
  dispatchId: z.string().optional(),
  /** omitted -> server fills in the current unread count; null -> don't touch the badge */
  badgeCount: z.number().int().min(0).nullable().optional(),
  actions: z.array(PushAction).max(2).optional(),
  requireInteraction: z.boolean().optional(),
  ttl: z.number().int().min(0).max(86_400).optional(),
  urgency: z.enum(['very-low', 'low', 'normal', 'high']).optional(),
  delaySec: z.number().int().min(0).max(300).optional(),
  targetEndpointTail: z.string().optional(), // send to one subscription only
})
export type PushSendRequest = z.infer<typeof PushSendRequest>
export const PushSendResult = z.object({
  attempted: z.number().int(),
  delivered: z.number().int(),
  failed: z.number().int(),
  pruned: z.number().int(), // 404/410 subscriptions removed
  scheduledInSec: z.number().int(),
  payload: PushPayload,
  results: z.array(z.object({ id: z.string(), ok: z.boolean(), statusCode: z.number().int().optional(), error: z.string().optional() })),
})
export type PushSendResult = z.infer<typeof PushSendResult>

// ─── Errors (uniform server error body) ───────────────────────────────────────
export const ERROR_CODES = [
  'bad_request',
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict', // 409 duplicate / 412 precondition failed
  'gone',
  'rate_limited',
  'unavailable', // 503 (chaos)
  'internal',
] as const
export const ApiErrorBody = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
})
export type ApiErrorBody = z.infer<typeof ApiErrorBody>

// ─── URL builders ─────────────────────────────────────────────────────────────
export const API = {
  ping: '/api/ping',
  version: '/api/version',
  session: '/api/session',
  dispatches: '/api/dispatches',
  dispatch: (id: string) => `/api/dispatches/${encodeURIComponent(id)}`,
  inbox: '/api/inbox/summary',
  inboxReadAll: '/api/inbox/read-all',
  digest: '/api/digest',
  stations: '/api/stations',
  station: (codeOrId: string) => `/api/stations/${encodeURIComponent(codeOrId)}`,
  signal: '/api/signal',
  handbook: '/api/handbook',
  handbookChapter: (slug: string) => `/api/handbook/${encodeURIComponent(slug)}`,
  bench: (strategy: BenchStrategy, key: string) => `/api/bench/${strategy}/${encodeURIComponent(key)}`,
  benchBump: (strategy: BenchStrategy, key: string) => `/api/bench/${strategy}/${encodeURIComponent(key)}/bump`,
  pushVapid: '/api/push/vapid',
  pushSubscribe: '/api/push/subscribe',
  pushUnsubscribe: '/api/push/unsubscribe',
  pushSubscriptions: '/api/push/subscriptions',
  pushSend: '/api/push/send',
  lab: {
    state: '/api/_lab/state',
    truth: '/api/_lab/truth',
    chaos: '/api/_lab/chaos',
    wire: '/api/_lab/wire',
    wireSpawn: '/api/_lab/wire/spawn',
    release: '/api/_lab/release',
    headers: '/api/_lab/headers',
    session: '/api/_lab/session',
    log: '/api/_lab/log',
    events: '/api/_lab/events',
    reset: '/api/_lab/reset',
  },
  media: {
    dispatch: (id: string) => `/media/dispatch/${encodeURIComponent(id)}.svg`,
    station: (code: string) => `/media/station/${encodeURIComponent(code)}.svg`,
  },
} as const

/** Prefix that chaos never touches and that your service worker must leave alone (network-only / no respondWith). */
export const LAB_PREFIX = '/api/_lab'

// ─── Lab & push bodies the endpoints above imply but the schemas above do not spell out ──
// Added by the server platform; purely additive. The server validates request bodies with these.

/** PUT /api/_lab/headers (request and response). */
export const HeaderProfileBody = z.object({ profile: HeaderProfile })
export type HeaderProfileBody = z.infer<typeof HeaderProfileBody>

/** POST /api/_lab/wire/spawn. `count` defaults to 1; `severity` overrides the template's own. */
export const WireSpawnRequest = z.object({ count: z.number().int().min(1).max(10).optional(), severity: Severity.optional() })
export type WireSpawnRequest = z.infer<typeof WireSpawnRequest>
export const WireSpawnResult = z.object({ spawned: z.array(z.object({ id: z.string(), severity: Severity, title: z.string() })) })
export type WireSpawnResult = z.infer<typeof WireSpawnResult>

/** PUT /api/_lab/release: any subset of ReleaseState; the server also requires latestClient/minClient to be semver. Answers with the full ReleaseState. */
export const ReleasePatch = ReleaseState.partial()
export type ReleasePatch = z.infer<typeof ReleasePatch>

/** POST /api/_lab/session. 'set-ttl' affects sessions created afterwards; existing cookies keep their Max-Age. */
export const SessionControl = z.discriminatedUnion('action', [
  z.object({ action: z.literal('expire') }),
  z.object({ action: z.literal('set-ttl'), ttlSec: z.number().int().min(1).max(86_400) }),
])
export type SessionControl = z.infer<typeof SessionControl>
export const SessionControlResult = z.object({ sessionTtlSec: z.number().int(), sessions: z.number().int() })
export type SessionControlResult = z.infer<typeof SessionControlResult>

/** GET /api/push/subscriptions. */
export const PushSubscriptionList = z.object({ items: z.array(PushSubscriptionInfo) })
export type PushSubscriptionList = z.infer<typeof PushSubscriptionList>
/** POST /api/push/unsubscribe: by the browser's endpoint URL or by the id from the list. Idempotent. */
export const PushUnsubscribeRequest = z
  .object({ endpoint: z.string().url().optional(), id: z.string().optional() })
  .refine((v) => v.endpoint !== undefined || v.id !== undefined, { message: 'Give an endpoint or an id' })
export type PushUnsubscribeRequest = z.infer<typeof PushUnsubscribeRequest>
export const PushUnsubscribeResult = z.object({ removed: z.boolean() })
export type PushUnsubscribeResult = z.infer<typeof PushUnsubscribeResult>
