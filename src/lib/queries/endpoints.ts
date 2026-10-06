/**
 * One typed fetcher per endpoint in shared/contracts `API`. Each goes through apiFetch, so every response is
 * validated with the shared zod schema, every failure is an AppError, and every success carries ResponseMeta.
 * Nothing here caches or retries; that is the query layer's job (see the hooks next to this file).
 *
 * Lab calls skip the client network log: they are instrumentation, the server does not log them either, and
 * Lab -> Network joins the two logs on the requests the product itself makes.
 */
import { z } from 'zod'
import {
  API,
  BenchResponse,
  ChaosState,
  Digest,
  Dispatch,
  DispatchPage,
  HandbookChapter,
  HandbookIndex,
  HeaderProfileBody,
  InboxSummary,
  LabState,
  LabTruth,
  PushSendRequest,
  PushSendResult,
  PushSubscribeRequest,
  PushSubscriptionInfo,
  PushSubscriptionList,
  PushUnsubscribeRequest,
  PushUnsubscribeResult,
  PushVapid,
  ReleasePatch,
  ReleaseState,
  RequestLogPage,
  SessionControl,
  SessionControlResult,
  SessionResponse,
  SignalBoard,
  Station,
  StationList,
  WireSpawnRequest,
  WireSpawnResult,
  WireState,
  type BenchStrategy,
  type DispatchCreate,
  type DispatchFilters,
  type DispatchPatch,
} from '@shared/contracts'
import { apiFetch } from '@/lib/api/client'
import type { ApiResult } from '@/lib/api/types'

export interface CallOptions {
  signal?: AbortSignal
}

/** POST /api/push/send takes `kind` as optional (the server defaults it), hence the input type. */
export type PushSendInput = z.input<typeof PushSendRequest>

/** POST /api/bench/:strategy/:key/bump. The contract file does not spell this body out, only `{ rev }` matters. */
export const BenchBump = z.object({ rev: z.number().int() })
export type BenchBump = z.infer<typeof BenchBump>

/** The contract file exports PushVapid as a schema only. */
export type PushVapidInfo = z.infer<typeof PushVapid>

/** Lab endpoints are never cached by anything and never part of the product's own traffic. */
const lab = { netLog: false, cache: 'no-store' } as const

// ─── session ──────────────────────────────────────────────────────────────────
export const getSession = ({ signal }: CallOptions = {}): Promise<ApiResult<SessionResponse>> =>
  apiFetch({ path: API.session, schema: SessionResponse, signal })

export const createSession = (callsign: string): Promise<ApiResult<SessionResponse>> =>
  apiFetch({ method: 'POST', path: API.session, body: { callsign }, schema: SessionResponse })

export const deleteSession = (): Promise<ApiResult<SessionResponse>> => apiFetch({ method: 'DELETE', path: API.session, schema: SessionResponse })

// ─── dispatches ───────────────────────────────────────────────────────────────
export const getDispatchPage = (filters: DispatchFilters = {}, { signal }: CallOptions = {}): Promise<ApiResult<DispatchPage>> =>
  apiFetch({ path: API.dispatches, query: { ...filters }, schema: DispatchPage, signal })

export const getDispatch = (id: string, { signal }: CallOptions = {}): Promise<ApiResult<Dispatch>> =>
  apiFetch({ path: API.dispatch(id), schema: Dispatch, signal })

/** `idempotencyKey` is the dispatch's clientId: replaying the same key answers 200 with the same dispatch instead of filing twice. */
export const createDispatch = (input: DispatchCreate, idempotencyKey: string): Promise<ApiResult<Dispatch>> =>
  apiFetch({ method: 'POST', path: API.dispatches, body: input, idempotencyKey, schema: Dispatch })

/** `ifMatch` is an ETag (W/"dp-000123-r4"). A stale one is answered with 412 and the current dispatch in `details`. */
export const patchDispatch = (id: string, patch: DispatchPatch, { ifMatch }: { ifMatch?: string } = {}): Promise<ApiResult<Dispatch>> =>
  apiFetch({ method: 'PATCH', path: API.dispatch(id), body: patch, ifMatch, schema: Dispatch })

// ─── inbox, digest ────────────────────────────────────────────────────────────
export const getInbox = ({ signal }: CallOptions = {}): Promise<ApiResult<InboxSummary>> =>
  apiFetch({ path: API.inbox, schema: InboxSummary, signal })

export const markAllRead = (): Promise<ApiResult<InboxSummary>> => apiFetch({ method: 'POST', path: API.inboxReadAll, schema: InboxSummary })

/** `since` is an ISO time; absent means the last 24 hours. */
export const getDigest = (since?: string | null, { signal }: CallOptions = {}): Promise<ApiResult<Digest>> =>
  apiFetch({ path: API.digest, query: { since }, schema: Digest, signal })

// ─── stations, signal, handbook ───────────────────────────────────────────────
export const getStations = ({ signal }: CallOptions = {}): Promise<ApiResult<StationList>> =>
  apiFetch({ path: API.stations, schema: StationList, signal })

export const getStation = (codeOrId: string, { signal }: CallOptions = {}): Promise<ApiResult<Station>> =>
  apiFetch({ path: API.station(codeOrId), schema: Station, signal })

export const getSignal = ({ signal }: CallOptions = {}): Promise<ApiResult<SignalBoard>> =>
  apiFetch({ path: API.signal, schema: SignalBoard, signal })

export const getHandbookIndex = ({ signal }: CallOptions = {}): Promise<ApiResult<HandbookIndex>> =>
  apiFetch({ path: API.handbook, schema: HandbookIndex, signal })

export const getHandbookChapter = (slug: string, { signal }: CallOptions = {}): Promise<ApiResult<HandbookChapter>> =>
  apiFetch({ path: API.handbookChapter(slug), schema: HandbookChapter, signal })

// ─── strategy bench ───────────────────────────────────────────────────────────
export const getBench = (strategy: BenchStrategy, key: string, { signal }: CallOptions = {}): Promise<ApiResult<BenchResponse>> =>
  apiFetch({ path: API.bench(strategy, key), schema: BenchResponse, signal })

export const bumpBench = (strategy: BenchStrategy, key: string): Promise<ApiResult<BenchBump>> =>
  apiFetch({ method: 'POST', path: API.benchBump(strategy, key), schema: BenchBump })

// ─── push ─────────────────────────────────────────────────────────────────────
export const getPushVapid = ({ signal }: CallOptions = {}): Promise<ApiResult<PushVapidInfo>> =>
  apiFetch({ path: API.pushVapid, schema: PushVapid, signal })

export const getPushSubscriptions = ({ signal }: CallOptions = {}): Promise<ApiResult<PushSubscriptionList>> =>
  apiFetch({ path: API.pushSubscriptions, schema: PushSubscriptionList, signal })

export const subscribePush = (request: PushSubscribeRequest): Promise<ApiResult<PushSubscriptionInfo>> =>
  apiFetch({ method: 'POST', path: API.pushSubscribe, body: request, schema: PushSubscriptionInfo })

export const unsubscribePush = (request: PushUnsubscribeRequest): Promise<ApiResult<PushUnsubscribeResult>> =>
  apiFetch({ method: 'POST', path: API.pushUnsubscribe, body: request, schema: PushUnsubscribeResult })

export const sendPush = (request: PushSendInput): Promise<ApiResult<PushSendResult>> =>
  apiFetch({ method: 'POST', path: API.pushSend, body: request, schema: PushSendResult })

// ─── lab ──────────────────────────────────────────────────────────────────────
export const getLabState = ({ signal }: CallOptions = {}): Promise<ApiResult<LabState>> =>
  apiFetch({ path: API.lab.state, schema: LabState, signal, ...lab })

export const getLabTruth = ({ signal }: CallOptions = {}): Promise<ApiResult<LabTruth>> =>
  apiFetch({ path: API.lab.truth, schema: LabTruth, signal, ...lab })

export const putChaos = (state: ChaosState): Promise<ApiResult<ChaosState>> =>
  apiFetch({ method: 'PUT', path: API.lab.chaos, body: state, schema: ChaosState, ...lab })

/** Toggles a named rule (or hard-down, schema-drift, all-clear). Answers with the resulting chaos state. */
export const applyChaosPreset = (name: string): Promise<ApiResult<ChaosState>> =>
  apiFetch({ method: 'POST', path: `${API.lab.chaos}/preset/${encodeURIComponent(name)}`, schema: ChaosState, ...lab })

export const putWire = (patch: Partial<WireState>): Promise<ApiResult<WireState>> =>
  apiFetch({ method: 'PUT', path: API.lab.wire, body: patch, schema: WireState, ...lab })

export const spawnWire = (request: WireSpawnRequest): Promise<ApiResult<WireSpawnResult>> =>
  apiFetch({ method: 'POST', path: API.lab.wireSpawn, body: request, schema: WireSpawnResult, ...lab })

export const putRelease = (patch: ReleasePatch): Promise<ApiResult<ReleaseState>> =>
  apiFetch({ method: 'PUT', path: API.lab.release, body: patch, schema: ReleaseState, ...lab })

export const putHeaderProfile = (body: HeaderProfileBody): Promise<ApiResult<HeaderProfileBody>> =>
  apiFetch({ method: 'PUT', path: API.lab.headers, body, schema: HeaderProfileBody, ...lab })

export const controlSession = (control: SessionControl): Promise<ApiResult<SessionControlResult>> =>
  apiFetch({ method: 'POST', path: API.lab.session, body: control, schema: SessionControlResult, ...lab })

/** Entries with seq greater than `since`; all of them (up to the 500-entry ring) when absent. */
export const getLabLog = (since?: number, { signal }: CallOptions = {}): Promise<ApiResult<RequestLogPage>> =>
  apiFetch({ path: API.lab.log, query: { since }, schema: RequestLogPage, signal, ...lab })

export const deleteLabLog = (): Promise<ApiResult<RequestLogPage>> => apiFetch({ method: 'DELETE', path: API.lab.log, schema: RequestLogPage, ...lab })

export const resetLab = (): Promise<ApiResult<LabState>> => apiFetch({ method: 'POST', path: API.lab.reset, schema: LabState, ...lab })
