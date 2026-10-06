/**
 * The in-memory world: stations, dispatches, sessions, bench counters, release state.
 * Seeding is deterministic (seeded PRNG); only timestamps move, because they are taken
 * relative to the moment of (re)seeding so the newest dispatches are always minutes old.
 */
import { randomBytes } from 'node:crypto'
import type { z } from 'zod'
import {
  API,
  API_VERSION,
  BENCH_KEYS,
  BENCH_STRATEGIES,
  type BenchResponse,
  type BenchStrategy,
  type Coords,
  type Digest,
  type DispatchCreate,
  type DispatchFilters,
  type DispatchPage,
  type DispatchPatch,
  type DriftedDispatch,
  type HandbookChapter,
  type HandbookIndex,
  type InboxSummary,
  type LabTruth,
  type ReleaseState,
  type Session,
  type Severity,
  type SignalBoard,
  type SignalReading,
  type Station,
  type StationList,
  type StationStatus,
  type Dispatch,
} from '../shared/contracts'
import { runtime } from './runtime'
import { DISPATCH_SEEDS, OPERATOR_CALLSIGNS, WIRE_TEMPLATES } from './seed/dispatches'
import { HANDBOOK_CHAPTERS } from './seed/handbook'
import { STATION_SEEDS } from './seed/stations'
import { HttpError, clamp, hashString, mulberry32, newId, pick, randInt } from './util'

const MINUTE = 60_000
const HOUR = 3_600_000
const DEFAULT_LIMIT = 12
const DIGEST_MAX = 20
const DEFAULT_SESSION_TTL_SEC = 600
/** Bounds for state that clients can grow without limit (the wire generator can file one dispatch every 2 s). */
const MAX_DISPATCHES = 1000
const MAX_SESSIONS = 500
/** Seeded dispatches older than this are already read; newer ones start unread. */
const READ_AFTER_HOURS = 18

type DispatchSource = 'api' | 'wire'
type WireDispatch = Dispatch | z.infer<typeof DriftedDispatch>

const LEVEL: Record<Severity, number> = { routine: 1, notice: 2, urgent: 3, critical: 4 }

/** What routes must send for a dispatch: the contract shape, or the drifted one while the lab switch is on. */
export function toWireDispatch(d: Dispatch): WireDispatch {
  if (!runtime.chaos.schemaDrift) return d
  return { id: d.id, station_id: d.stationId, title: d.title, body: d.body, level: LEVEL[d.severity], filed_at: d.filedAt }
}

function defaultRelease(): ReleaseState {
  return { latestClient: '1.0.0', minClient: '1.0.0', api: API_VERSION, handbookEdition: '1988.4' }
}

const stationIdOf = (code: string): string => `st-${code.toLowerCase().replace('-', '')}`
const dispatchIdOf = (n: number): string => `dp-${String(n).padStart(6, '0')}`
const revisionTag = (d: Dispatch): string => `W/"${d.id}-r${d.rev}"`
/**
 * The validator for one dispatch: W/"<id>-r<rev>". While schema drift is on the same revision has a different
 * shape on the wire, so the validator changes too; otherwise a client revalidating across the switch would get
 * a 304 and keep the old shape forever. If-Match accepts either spelling (see etagMatches).
 */
export const dispatchEtag = (d: Dispatch): string => (runtime.chaos.schemaDrift ? `W/"${d.id}-r${d.rev}-drift"` : revisionTag(d))

// ─── cursor ───────────────────────────────────────────────────────────────────
// Keyset cursor (filedAt + id) rather than an offset: new dispatches arriving between two page
// requests must not shift items onto the wrong page.
function encodeCursor(d: Dispatch): string {
  return Buffer.from(`${d.filedAt}|${d.id}`).toString('base64url')
}
function decodeCursor(cursor: string): { filedAt: string; id: string } {
  const [filedAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  if (!filedAt || !id || Number.isNaN(Date.parse(filedAt))) throw new HttpError(400, 'bad_request', 'Malformed cursor')
  return { filedAt, id }
}

/** Newest first: filedAt descending, then id descending. */
function isAfter(d: Dispatch, cursor: { filedAt: string; id: string }): boolean {
  return d.filedAt < cursor.filedAt || (d.filedAt === cursor.filedAt && d.id < cursor.id)
}

// ─── world ────────────────────────────────────────────────────────────────────
interface SessionRecord {
  session: Session
  expiresAtMs: number
}

interface World {
  stations: Station[]
  dispatches: Dispatch[] // always sorted newest first
  byId: Map<string, Dispatch>
  clientKeys: Map<string, string> // Idempotency-Key -> dispatch id
  feedRev: number
  benchState: Map<string, { rev: number; hits: number }>
  sessions: Map<string, SessionRecord>
  signalSeq: number
  rng: () => number // wire generator + drift
  handbook: { edition: string; updatedAt: string }
}

const serverInstance = newId(6)
const startedAtMs = Date.now()
/** Dispatch numbers are never reused across resets: a recycled id with rev 1 would let a stale ETag match new content. */
let nextDispatchSeq = 1
const listeners = new Set<(d: Dispatch, source: DispatchSource) => void>()
let driftTimer: NodeJS.Timeout | null = null

function compareNewestFirst(a: Dispatch, b: Dispatch): number {
  if (a.filedAt !== b.filedAt) return a.filedAt < b.filedAt ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

function seedStations(now: number, rng: () => number): Station[] {
  return STATION_SEEDS.map((s) => {
    const ageMs =
      s.status === 'online' ? randInt(rng, 1, 9) * MINUTE : s.status === 'degraded' ? randInt(rng, 12, 55) * MINUTE : randInt(rng, 3, 20) * HOUR
    return {
      id: stationIdOf(s.code),
      code: s.code,
      name: s.name,
      region: s.region,
      kind: s.kind,
      status: s.status,
      lat: s.lat,
      lng: s.lng,
      elevationM: s.elevationM,
      crew: s.crew,
      lastContactAt: new Date(now - ageMs).toISOString(),
      blurb: s.blurb,
      rev: 1,
    }
  })
}

function buildWorld(): World {
  const now = Date.now()
  const rng = mulberry32(hashString('outpost:world'))
  const stations = seedStations(now, rng)
  const codes = new Map(stations.map((s) => [s.code, s]))

  // Oldest seed gets the lowest number, so ids grow with time like a real log.
  const ordered = [...DISPATCH_SEEDS].sort((a, b) => b.hoursAgo - a.hoursAgo)
  const dispatches = ordered.map((seed, i): Dispatch => {
    const station = codes.get(seed.stationCode)
    if (!station) throw new Error(`Dispatch seed references unknown station ${seed.stationCode}`)
    const id = dispatchIdOf(i + 1)
    return {
      id,
      stationId: station.id,
      stationCode: station.code,
      title: seed.title,
      body: seed.body,
      severity: seed.severity,
      tags: seed.tags,
      filedAt: new Date(now - seed.hoursAgo * HOUR).toISOString(),
      filedBy: seed.filedBy,
      coords: seed.coords,
      imageUrl: API.media.dispatch(id),
      read: seed.hoursAgo > READ_AFTER_HOURS,
      acked: false,
      starred: false,
      rev: 1,
      clientId: null,
    }
  })
  dispatches.sort(compareNewestFirst)
  nextDispatchSeq = Math.max(nextDispatchSeq, dispatches.length + 1)

  const benchState = new Map<string, { rev: number; hits: number }>()
  for (const strategy of BENCH_STRATEGIES) for (const key of BENCH_KEYS) benchState.set(`${strategy}/${key}`, { rev: 1, hits: 0 })

  return {
    stations,
    dispatches,
    byId: new Map(dispatches.map((d) => [d.id, d])),
    clientKeys: new Map(),
    feedRev: 1,
    benchState,
    sessions: new Map(),
    signalSeq: 0,
    rng: mulberry32(hashString('outpost:wire')),
    handbook: { edition: defaultRelease().handbookEdition, updatedAt: new Date(now).toISOString() },
  }
}

let world = buildWorld()

// ─── dispatches ───────────────────────────────────────────────────────────────
function matcher(f: DispatchFilters): (d: Dispatch) => boolean {
  const station = f.station?.toLowerCase()
  const q = f.q?.trim().toLowerCase()
  return (d) => {
    if (f.severity && d.severity !== f.severity) return false
    if (station && d.stationCode.toLowerCase() !== station && d.stationId !== station) return false
    if (f.unread !== undefined && d.read === f.unread) return false
    if (f.starred !== undefined && d.starred !== f.starred) return false
    if (q) {
      const haystack = `${d.title}\n${d.body}\n${d.tags.join(' ')}\n${d.stationCode}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  }
}

function replaceDispatch(next: Dispatch): void {
  const index = world.dispatches.findIndex((d) => d.id === next.id)
  world.dispatches[index] = next
  world.byId.set(next.id, next)
}

function findStation(codeOrId: string): Station | undefined {
  const needle = codeOrId.toLowerCase()
  return world.stations.find((s) => s.id === needle || s.code.toLowerCase() === needle)
}

function emitCreated(d: Dispatch, source: DispatchSource): void {
  for (const cb of listeners) {
    try {
      cb(d, source)
    } catch (err) {
      console.error('onDispatchCreated listener failed', err)
    }
  }
}

function insertDispatch(input: {
  station: Station
  title: string
  body: string
  severity: Severity
  tags: string[]
  coords: Coords | null
  filedAt: string
  filedBy: string
  clientId: string | null
  source: DispatchSource
}): Dispatch {
  const id = dispatchIdOf(nextDispatchSeq++)
  const dispatch: Dispatch = {
    id,
    stationId: input.station.id,
    stationCode: input.station.code,
    title: input.title,
    body: input.body,
    severity: input.severity,
    tags: input.tags,
    filedAt: input.filedAt,
    filedBy: input.filedBy,
    coords: input.coords,
    imageUrl: API.media.dispatch(id),
    read: false,
    acked: false,
    starred: false,
    rev: 1,
    clientId: input.clientId,
  }
  // Make room first, so the dispatch being filed can never be the one that is evicted.
  for (const evicted of world.dispatches.splice(Math.max(0, MAX_DISPATCHES - 1))) {
    world.byId.delete(evicted.id)
    if (evicted.clientId) world.clientKeys.delete(evicted.clientId)
  }
  world.dispatches.push(dispatch)
  world.dispatches.sort(compareNewestFirst)
  world.byId.set(id, dispatch)
  if (input.clientId) world.clientKeys.set(input.clientId, id)
  world.feedRev += 1
  emitCreated(dispatch, input.source)
  return dispatch
}

/** If-Match names a revision, not a wire shape: a tag from before the drift switch still identifies the same revision. */
function etagMatches(header: string, d: Dispatch): boolean {
  const normalise = (tag: string): string => tag.trim().replace(/^W\//, '')
  const accepted = [normalise(revisionTag(d)), normalise(dispatchEtag(d))]
  return header.split(',').some((candidate) => candidate.trim() === '*' || accepted.includes(normalise(candidate)))
}

function inboxSummary(): InboxSummary {
  let unread = 0
  let urgentUnread = 0
  for (const d of world.dispatches) {
    if (d.read) continue
    unread += 1
    if (d.severity === 'urgent' || d.severity === 'critical') urgentUnread += 1
  }
  return { unread, urgentUnread, total: world.dispatches.length, feedRev: world.feedRev, asOf: new Date().toISOString() }
}

// ─── stations ─────────────────────────────────────────────────────────────────
const NEXT_STATUS: Record<StationStatus, readonly [StationStatus, StationStatus]> = {
  online: ['degraded', 'degraded'],
  degraded: ['online', 'dark'],
  dark: ['degraded', 'online'],
}

function driftOnce(): void {
  const rng = world.rng
  const station = pick(rng, world.stations)
  let status = station.status
  // Roughly half of the ticks change status; the rest are just a fresh contact time.
  if (rng() < 0.55) status = pick(rng, NEXT_STATUS[station.status])
  const lastContactAt = status === 'dark' ? station.lastContactAt : new Date().toISOString()
  const next: Station = { ...station, status, lastContactAt, rev: station.rev + 1 }
  world.stations = world.stations.map((s) => (s.id === next.id ? next : s))
}

function scheduleDrift(): void {
  const delay = randInt(world.rng, 2, 4) * MINUTE
  driftTimer = setTimeout(() => {
    driftOnce()
    scheduleDrift()
  }, delay)
  driftTimer.unref()
}

// ─── signal ───────────────────────────────────────────────────────────────────
const KIND_TEMP_OFFSET: Record<Station['kind'], number> = { weather: 0, seismic: 2, 'radio-relay': -3, glacier: -9, coastal: 4 }

function readingFor(station: Station, seq: number): SignalReading {
  const base = mulberry32(hashString(station.code))
  const rssi = -62 - base() * 34
  const snr = 12 + base() * 18
  const latency = 90 + base() * 330
  const battery = 55 + base() * 43
  const tempBase = 8 - station.elevationM / 160 + KIND_TEMP_OFFSET[station.kind]
  const wind = 8 + base() * 47
  // Jitter is a pure function of (station, seq): the same request number always yields the same reading.
  const j = mulberry32(hashString(`${station.code}#${seq}`))
  const swing = (range: number): number => (j() * 2 - 1) * range
  const round = (n: number): number => Math.round(n * 10) / 10

  if (station.status === 'dark') {
    // A dark station reports nothing; the floor values are what the receiver shows with no carrier.
    return {
      stationId: station.id,
      stationCode: station.code,
      status: station.status,
      rssiDbm: -128,
      snrDb: 0,
      latencyMs: 0,
      batteryPct: round(clamp(battery - 30 + swing(0.4), 1, 100)),
      tempC: round(tempBase + swing(1)),
      windKph: round(clamp(wind + swing(4), 0, 160)),
    }
  }
  const degraded = station.status === 'degraded'
  return {
    stationId: station.id,
    stationCode: station.code,
    status: station.status,
    rssiDbm: round(rssi - (degraded ? 14 : 0) + swing(3)),
    snrDb: round(clamp(snr - (degraded ? 9 : 0) + swing(1.5), 0, 40)),
    latencyMs: Math.round(clamp(latency * (degraded ? 3 : 1) + swing(30), 20, 4000)),
    batteryPct: round(clamp(battery - (degraded ? 15 : 0) + swing(0.4), 1, 100)),
    tempC: round(tempBase + swing(1.2)),
    windKph: round(clamp(wind + swing(6), 0, 160)),
  }
}

// ─── bench ────────────────────────────────────────────────────────────────────
const BENCH_LABELS: Record<(typeof BENCH_KEYS)[number], string> = {
  alpha: 'Alpha ridge line',
  beta: 'Beta ice shelf',
  gamma: 'Gamma relay mast',
  delta: 'Delta (not in any precache list)',
}

/** Pure function of (key, rev): the same pair always yields the same number, a bump always changes it. */
function benchSample(key: string, rev: number): number {
  return randInt(mulberry32(hashString(`${key}@${rev}`)), 1000, 9999)
}

function benchSlot(strategy: BenchStrategy, key: string): { rev: number; hits: number } | undefined {
  return world.benchState.get(`${strategy}/${key}`)
}

// ─── wire ─────────────────────────────────────────────────────────────────────
function fill(template: string, vars: { station: string; code: string; n: number }): string {
  return template.replaceAll('{station}', vars.station).replaceAll('{code}', vars.code).replaceAll('{n}', String(vars.n))
}

// ─── the store ────────────────────────────────────────────────────────────────
export const store = {
  serverInstance,
  startedAt: new Date(startedAtMs).toISOString(),
  release: defaultRelease(),
  sessionTtlSec: DEFAULT_SESSION_TTL_SEC,

  counters: {
    get dispatches(): number {
      return world.dispatches.length
    },
  },

  feedRev(): number {
    return world.feedRev
  },

  listDispatches(f: DispatchFilters): DispatchPage {
    const limit = clamp(f.limit ?? DEFAULT_LIMIT, 1, 50)
    const matching = world.dispatches.filter(matcher(f))
    let start = 0
    if (f.cursor) {
      const cursor = decodeCursor(f.cursor)
      start = matching.findIndex((d) => isAfter(d, cursor))
      if (start === -1) start = matching.length
    }
    const items = matching.slice(start, start + limit)
    const last = items.at(-1)
    const hasMore = start + limit < matching.length
    return { items, nextCursor: last && hasMore ? encodeCursor(last) : null, total: matching.length, feedRev: world.feedRev }
  },

  getDispatch(id: string): Dispatch | undefined {
    return world.byId.get(id)
  },

  createDispatch(input: DispatchCreate, operatorCallsign: string, opts?: { source?: DispatchSource }): { dispatch: Dispatch; replay: boolean } {
    const existingId = world.clientKeys.get(input.clientId)
    const existing = existingId ? world.byId.get(existingId) : undefined
    if (existing) return { dispatch: existing, replay: true }

    const station = findStation(input.stationId)
    if (!station) throw new HttpError(422, 'validation_failed', `stationId: no station "${input.stationId}"`)

    const now = Date.now()
    const claimed = input.filedAtClient ? Date.parse(input.filedAtClient) : Number.NaN
    // An offline draft may be hours old; a clock running ahead of ours is not believed.
    const filedAtMs = Number.isNaN(claimed) || claimed > now ? now : claimed
    const dispatch = insertDispatch({
      station,
      title: input.title,
      body: input.body,
      severity: input.severity,
      tags: input.tags ?? [],
      coords: input.coords ?? null,
      filedAt: new Date(filedAtMs).toISOString(),
      filedBy: operatorCallsign,
      clientId: input.clientId,
      source: opts?.source ?? 'api',
    })
    return { dispatch, replay: false }
  },

  patchDispatch(
    id: string,
    patch: DispatchPatch,
    ifMatch?: string,
  ): { ok: true; dispatch: Dispatch } | { ok: false; reason: 'not_found' } | { ok: false; reason: 'conflict'; current: Dispatch } {
    const current = world.byId.get(id)
    if (!current) return { ok: false, reason: 'not_found' }
    if (ifMatch !== undefined && !etagMatches(ifMatch, current)) return { ok: false, reason: 'conflict', current }

    const changed =
      (patch.read !== undefined && patch.read !== current.read) ||
      (patch.acked !== undefined && patch.acked !== current.acked) ||
      (patch.starred !== undefined && patch.starred !== current.starred)
    // A patch that changes nothing is a successful no-op: same rev, same ETag.
    if (!changed) return { ok: true, dispatch: current }

    const next: Dispatch = {
      ...current,
      read: patch.read ?? current.read,
      acked: patch.acked ?? current.acked,
      starred: patch.starred ?? current.starred,
      rev: current.rev + 1,
    }
    replaceDispatch(next)
    world.feedRev += 1
    return { ok: true, dispatch: next }
  },

  inboxSummary,

  markAllRead(): InboxSummary {
    let changed = false
    for (const d of world.dispatches) {
      if (d.read) continue
      replaceDispatch({ ...d, read: true, rev: d.rev + 1 })
      changed = true
    }
    if (changed) world.feedRev += 1
    return inboxSummary()
  },

  digest(sinceIso?: string): Digest {
    const now = Date.now()
    const sinceMs = sinceIso ? Date.parse(sinceIso) : now - 24 * HOUR
    const since = new Date(sinceMs).toISOString()
    const fresh = world.dispatches.filter((d) => d.filedAt > since)
    return {
      generatedAt: new Date(now).toISOString(),
      since: sinceIso ? since : null,
      newCount: fresh.length,
      urgentCount: fresh.filter((d) => d.severity === 'urgent' || d.severity === 'critical').length,
      unread: world.dispatches.filter((d) => !d.read).length,
      items: fresh.slice(0, DIGEST_MAX),
    }
  },

  listStations(): StationList {
    return { items: world.stations, asOf: new Date().toISOString() }
  },

  getStation(codeOrId: string): Station | undefined {
    return findStation(codeOrId)
  },

  signalBoard(): SignalBoard {
    world.signalSeq += 1
    const seq = world.signalSeq
    return { seq, sampledAt: new Date().toISOString(), readings: world.stations.map((s) => readingFor(s, seq)) }
  },

  handbookIndex(): HandbookIndex {
    const edition = store.release.handbookEdition
    if (edition !== world.handbook.edition) world.handbook = { edition, updatedAt: new Date().toISOString() }
    return {
      edition,
      updatedAt: world.handbook.updatedAt,
      chapters: HANDBOOK_CHAPTERS.map(({ slug, number, title, summary, readMinutes }) => ({ slug, number, title, summary, readMinutes })),
    }
  },

  handbookChapter(slug: string): HandbookChapter | undefined {
    const chapter = HANDBOOK_CHAPTERS.find((c) => c.slug === slug)
    return chapter ? { ...chapter, edition: store.release.handbookEdition } : undefined
  },

  bench: {
    /** Counts one server answer. `requestId` is stamped into the body so a response can be matched to the request log. */
    get(strategy: BenchStrategy, key: string, requestId?: string): BenchResponse | undefined {
      const slot = benchSlot(strategy, key)
      if (!slot) return undefined
      slot.hits += 1
      return {
        strategy,
        key,
        rev: slot.rev,
        hits: slot.hits,
        servedAt: new Date().toISOString(),
        serverInstance,
        requestId: requestId ?? newId(8),
        payload: { label: BENCH_LABELS[key as keyof typeof BENCH_LABELS] ?? key, sample: benchSample(key, slot.rev) },
      }
    },
    bump(strategy: BenchStrategy, key: string): { rev: number } | undefined {
      const slot = benchSlot(strategy, key)
      if (!slot) return undefined
      slot.rev += 1
      return { rev: slot.rev }
    },
    snapshot(): { strategy: BenchStrategy; key: string; rev: number; hits: number }[] {
      return [...world.benchState].map(([path, { rev, hits }]) => {
        const [strategy, key] = path.split('/') as [BenchStrategy, string]
        return { strategy, key, rev, hits }
      })
    },
  },

  sessions: {
    create(callsign: string): { id: string; session: Session } {
      const nowMs = Date.now()
      const expiresAtMs = nowMs + store.sessionTtlSec * 1000
      const session: Session = {
        operator: { callsign, displayName: `Operator ${callsign.toUpperCase()}` },
        issuedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
      }
      const id = randomBytes(24).toString('base64url')
      store.sessions.count() // drops expired records
      // Oldest first: a Map iterates in insertion order.
      for (const oldest of world.sessions.keys()) {
        if (world.sessions.size < MAX_SESSIONS) break
        world.sessions.delete(oldest)
      }
      world.sessions.set(id, { session, expiresAtMs })
      return { id, session }
    },
    get(id: string): Session | undefined {
      const record = world.sessions.get(id)
      if (!record) return undefined
      if (record.expiresAtMs <= Date.now()) {
        world.sessions.delete(id)
        return undefined
      }
      return record.session
    },
    destroy(id: string): void {
      world.sessions.delete(id)
    },
    expireAll(): void {
      // Records stay until read so the cookie still arrives and is seen to be dead, like a real expiry.
      for (const record of world.sessions.values()) record.expiresAtMs = 0
    },
    count(): number {
      const now = Date.now()
      for (const [id, record] of world.sessions) if (record.expiresAtMs <= now) world.sessions.delete(id)
      return world.sessions.size
    },
  },

  truth(currentSession: Session | null): LabTruth {
    return {
      asOf: new Date().toISOString(),
      feedRev: world.feedRev,
      inbox: inboxSummary(),
      dispatches: world.dispatches.map(({ id, rev, read, acked, starred }) => ({ id, rev, read, acked, starred })),
      stations: world.stations.map(({ id, rev }) => ({ id, rev })),
      bench: store.bench.snapshot(),
      handbookEdition: store.release.handbookEdition,
      session: currentSession,
    }
  },

  spawnWireDispatch(opts?: { severity?: Severity }): Dispatch {
    const rng = world.rng
    const template = pick(rng, WIRE_TEMPLATES)
    const fitting = template.kinds ? world.stations.filter((s) => template.kinds?.includes(s.kind)) : world.stations
    const station = pick(rng, fitting.length > 0 ? fitting : world.stations)
    const vars = { station: station.name, code: station.code, n: randInt(rng, 2, 48) }
    // Half of the wire reports carry a position, scattered within a few hundred metres of the station.
    const coords = rng() < 0.5 ? { lat: Math.round((station.lat + (rng() - 0.5) * 0.01) * 1e4) / 1e4, lng: Math.round((station.lng + (rng() - 0.5) * 0.02) * 1e4) / 1e4 } : null
    return insertDispatch({
      station,
      title: fill(template.title, vars),
      body: fill(template.body, vars),
      severity: opts?.severity ?? template.severity,
      tags: template.tags,
      coords,
      filedAt: new Date().toISOString(),
      filedBy: pick(rng, OPERATOR_CALLSIGNS),
      clientId: null,
      source: 'wire',
    })
  },

  onDispatchCreated(cb: (d: Dispatch, source: DispatchSource) => void): () => void {
    listeners.add(cb)
    return () => {
      listeners.delete(cb)
    }
  },

  startDrift(): void {
    if (!driftTimer) scheduleDrift()
  },

  stopDrift(): void {
    if (driftTimer) clearTimeout(driftTimer)
    driftTimer = null
  },

  reset(): void {
    world = buildWorld()
    store.release = defaultRelease()
    store.sessionTtlSec = DEFAULT_SESSION_TTL_SEC
  },
}

export type Store = typeof store
