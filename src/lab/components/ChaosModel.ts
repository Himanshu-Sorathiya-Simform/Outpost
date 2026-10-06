import { ChaosRule, type ChaosMode, type ChaosState } from '@shared/contracts'
import type { AppErrorKind } from '@/lib'
import { kindForStatus } from '@/lib'

/** The ten ChaosMode values plus the two switches, which behave like modes: each has a predictable client symptom. */
export type ChaosKey = ChaosMode | 'server-offline' | 'schema-drift'

export type ExpectedKind = AppErrorKind | 'ok'

export interface PresetInfo {
  id: string
  name: string
  /** What the server does. */
  does: string
  /** The AppError kind the client should report, in words. */
  produces: string
  /** The PWA behaviour it is meant to exercise. */
  exercises: string
  /** The switch presets act on a flag, all-clear on everything; the rest toggle the stock rule with this id. */
  type: 'rule' | 'switch' | 'reset'
}

export const PRESETS: readonly PresetInfo[] = [
  {
    id: 'lie-fi',
    name: 'Lie-fi',
    does: 'Every request under /api, reads and writes alike, waits 4 to 9 seconds before it is answered. The connection is up; nothing useful arrives. The reachability probe gives up after 3 seconds, so the telemetry strip reports lie-fi.',
    produces: 'Nothing by default (it succeeds late); timeout once the request timeout is shorter than the wait.',
    exercises: 'Network-first needs its own timeout so the cache can answer after a few seconds. Stale-while-revalidate hides the wait entirely.',
    type: 'rule',
  },
  {
    id: 'flaky',
    name: 'Flaky API',
    does: 'Three in ten requests under /api are answered with HTTP 500 and a JSON error body.',
    produces: 'server on the failures, a normal answer on the rest.',
    exercises: 'A worker must not cache a 5xx as if it were the answer, and should fall back to the last good copy. Retries need backoff.',
    type: 'rule',
  },
  {
    id: 'captive-portal',
    name: 'Captive portal',
    does: 'Every /api request is answered 200 with an HTML sign-in page instead of JSON.',
    produces: 'parse, with a message that names the content type.',
    exercises: 'A worker must check content-type before cache.put. A cached portal page served as the dispatch feed is the classic offline bug.',
    type: 'rule',
  },
  {
    id: 'slow-8s',
    name: 'Slow 8 s',
    does: 'Every /api request is held for 8 seconds, then answered normally.',
    produces: 'Nothing by default; timeout if the request timeout is below 8 s.',
    exercises: 'Navigation preload, request timeouts, and whether a spinner is an acceptable answer for a screen that could be cached.',
    type: 'rule',
  },
  {
    id: 'corrupt-json',
    name: 'Corrupt JSON',
    does: 'Every /api request is answered 200 application/json with a body that stops being valid JSON.',
    produces: 'parse.',
    exercises: 'Validate before you store. A cached corrupt body fails on every visit until something deletes it.',
    type: 'rule',
  },
  {
    id: 'rate-limited',
    name: 'Rate limited',
    does: 'Half of the /api requests are answered 429 with Retry-After: 5.',
    produces: 'rate-limited, carrying the wait the server asked for.',
    exercises: 'Background Sync replays must honour Retry-After and back off, or the next replay is refused too.',
    type: 'rule',
  },
  {
    id: 'stale-chunks',
    name: 'Stale chunks',
    does: 'Everything under /assets/ answers 404, as if the last deploy removed the old hashed files.',
    produces: 'not-found on a direct fetch; chunk-load when a lazy route imports one.',
    exercises: 'Lazy routes fail after a deploy. Precache the current build, keep the previous build\'s chunks until clients leave, and offer a reload.',
    type: 'rule',
  },
  {
    id: 'drop-writes',
    name: 'Dropped writes',
    does: 'Half of all POST requests have their socket destroyed before any answer.',
    produces: 'network (offline when the browser says so).',
    exercises: 'Queue failed writes for Background Sync and replay them with the same Idempotency-Key so a retry cannot file twice.',
    type: 'rule',
  },
  {
    id: 'truncate',
    name: 'Truncated feed',
    does: 'GET /api/dispatches sends a 200 and the first bytes of a body, then the socket is destroyed.',
    produces: 'network, raised while reading the body, not while connecting.',
    exercises: 'A worker that tees a response into the cache must not keep a half-written entry. Compare the body length to Content-Length.',
    type: 'rule',
  },
  {
    id: 'hang-signal',
    name: 'Signal board hangs',
    does: 'GET /api/signal is never answered. The connection stays open until the client gives up.',
    produces: 'timeout, after the request timeout.',
    exercises: 'Network-first with a timeout, and AbortSignal.timeout inside the fetch handler. Without one the screen waits forever.',
    type: 'rule',
  },
  {
    id: 'empty-body',
    name: 'Empty 200',
    does: 'Every /api request is answered 200 with a zero-length body.',
    produces: 'parse.',
    exercises: 'A 200 is not proof of a good response. Do not cache an empty body under a JSON URL.',
    type: 'rule',
  },
  {
    id: 'slow-body',
    name: 'Slow body',
    does: 'GET responses under /api are released in about forty small chunks, 150 ms apart. The headers arrive at once.',
    produces: 'Nothing by default (about six seconds); timeout if the request timeout is shorter.',
    exercises: 'fetch() resolves on headers, not on the body. A worker holding respondWith open for a slow stream holds the page open too.',
    type: 'rule',
  },
  {
    id: 'hard-down',
    name: 'Hard down',
    does: 'The server destroys the socket of every request except /api/_lab. Same as pulling the cable on the server.',
    produces: 'network (offline when navigator.onLine is false). The telemetry strip turns to lie-fi.',
    exercises: 'The offline fallback page, cached navigations, and showing "online but unreachable" instead of trusting navigator.onLine.',
    type: 'switch',
  },
  {
    id: 'schema-drift',
    name: 'Schema drift',
    does: 'Dispatch payloads switch to a different shape: snake_case fields, a numeric level instead of severity.',
    produces: 'schema-mismatch on dispatch requests; stations and the rest are untouched.',
    exercises: 'A cache outlives a deploy. Validate what comes out of it, version the cache name, and watch X-Api-Version.',
    type: 'switch',
  },
  {
    id: 'all-clear',
    name: 'All clear',
    does: 'Turns the server-offline and schema-drift switches off and disables every rule. Rules stay in the list.',
    produces: 'Normal behaviour.',
    exercises: 'Run this before you test anything else, and after you finish.',
    type: 'reset',
  },
]

export interface ModeInfo {
  key: ChaosKey
  label: string
  server: string
  /** The kinds that count as "the symptom you should see". */
  expect: (rule: ChaosRule | null) => ExpectedKind[]
  /** Only a JSON target can show it (an asset probe reads headers only). */
  needsBody: boolean
  /** Text for the table: the kinds in words. */
  expectText: string
}

export const MODES: readonly ModeInfo[] = [
  { key: 'pass', label: 'pass', server: 'Latency only, then the real answer.', expect: () => ['ok'], needsBody: false, expectText: 'ok, but late' },
  { key: 'status', label: 'status', server: 'Answers with the rule\'s HTTP status and a JSON error body.', expect: (r) => [kindForStatus(r?.status ?? 500)], needsBody: false, expectText: 'by status: server (500), unavailable (502-504), not-found (404), ...' },
  { key: 'drop', label: 'drop', server: 'Destroys the socket before answering.', expect: () => ['network', 'offline', 'unavailable'], needsBody: false, expectText: 'network (offline if the browser says so; unavailable behind the dev proxy)' },
  { key: 'hang', label: 'hang', server: 'Never answers.', expect: () => ['timeout'], needsBody: false, expectText: 'timeout' },
  { key: 'html-200', label: 'html-200', server: '200 with a captive-portal HTML page.', expect: () => ['parse'], needsBody: true, expectText: 'parse' },
  { key: 'empty-200', label: 'empty-200', server: '200 with a zero-length body.', expect: () => ['parse'], needsBody: true, expectText: 'parse' },
  { key: 'corrupt-json', label: 'corrupt-json', server: '200 application/json, body is broken JSON.', expect: () => ['parse'], needsBody: true, expectText: 'parse' },
  { key: 'truncate-json', label: 'truncate-json', server: 'Valid start of a JSON body, then the socket is destroyed.', expect: () => ['network', 'offline', 'unavailable', 'timeout'], needsBody: true, expectText: 'network, raised while reading the body (behind the dev proxy: unavailable or timeout)' },
  { key: 'slow-body', label: 'slow-body', server: 'Releases the real body in small chunks, 150 ms apart.', expect: () => ['ok', 'timeout'], needsBody: true, expectText: 'ok after about six seconds, or timeout' },
  { key: 'rate-limit', label: 'rate-limit', server: '429 with Retry-After.', expect: () => ['rate-limited'], needsBody: false, expectText: 'rate-limited' },
  { key: 'server-offline', label: 'server offline', server: 'Destroys every non-lab socket.', expect: () => ['network', 'offline', 'unavailable'], needsBody: false, expectText: 'network (offline if the browser says so; unavailable behind the dev proxy)' },
  { key: 'schema-drift', label: 'schema drift', server: 'Dispatch payloads change shape.', expect: () => ['schema-mismatch'], needsBody: true, expectText: 'schema-mismatch, on dispatch requests' },
]

export const modeInfo = (key: ChaosKey): ModeInfo => MODES.find((m) => m.key === key) as ModeInfo

// ─── state helpers ────────────────────────────────────────────────────────────

export const activeRules = (state: ChaosState): number => state.rules.filter((r) => r.enabled).length
export const chaosIsActive = (state: ChaosState): boolean => state.serverOffline || state.schemaDrift || activeRules(state) > 0

export const EMPTY_CHAOS: ChaosState = { serverOffline: false, schemaDrift: false, rules: [] }

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
export const chaosEqual = (a: ChaosState, b: ChaosState): boolean => same(a, b)

// ─── matching ─────────────────────────────────────────────────────────────────

export type TestMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** The server treats HEAD as GET when it matches a rule, so a reachability probe feels a GET rule. */
export const methodMatches = (rule: Pick<ChaosRule, 'method'>, method: string): boolean => rule.method === 'ANY' || (method === 'HEAD' ? 'GET' : method) === rule.method

export const isLabPath = (path: string): boolean => path === '/api/_lab' || path.startsWith('/api/_lab/')

export type Verdict =
  | { kind: 'exempt' }
  | { kind: 'offline' }
  | { kind: 'rule'; index: number; rule: ChaosRule }
  | { kind: 'none' }

/** Mirrors server/chaos.ts: lab paths are exempt, the offline switch beats every rule, then the first enabled rule that matches wins. */
export function matchRule(state: ChaosState, method: string, rawPath: string): Verdict {
  const path = rawPath.split(/[?#]/, 1)[0] ?? rawPath
  if (isLabPath(path)) return { kind: 'exempt' }
  if (state.serverOffline) return { kind: 'offline' }
  const index = state.rules.findIndex((r) => r.enabled && methodMatches(r, method) && path.startsWith(r.pathPrefix))
  const rule = state.rules[index]
  return rule ? { kind: 'rule', index, rule } : { kind: 'none' }
}

/** Rule `index` can never run because an earlier enabled rule matches every request it would match. */
export function shadowedBy(rules: readonly ChaosRule[], index: number): number | null {
  const r = rules[index]
  if (!r || !r.enabled) return null
  for (let i = 0; i < index; i++) {
    const earlier = rules[i]
    if (earlier?.enabled && (earlier.method === 'ANY' || earlier.method === r.method) && r.pathPrefix.startsWith(earlier.pathPrefix)) return i
  }
  return null
}

// ─── validation ───────────────────────────────────────────────────────────────

export type RuleErrors = Partial<Record<keyof ChaosRule, string>>

const FIELD_NAMES: Record<keyof ChaosRule, string> = {
  id: 'Id',
  label: 'Label',
  enabled: 'Enabled',
  method: 'Method',
  pathPrefix: 'Path prefix',
  latencyMs: 'Latency',
  jitterMs: 'Jitter',
  probability: 'Probability',
  mode: 'Mode',
  status: 'Status',
  retryAfterSec: 'Retry-After',
}

const RANGE: Partial<Record<keyof ChaosRule, string>> = {
  latencyMs: 'a whole number of milliseconds, 0 to 60000',
  jitterMs: 'a whole number of milliseconds, 0 to 60000',
  probability: 'a number from 0 to 1',
  status: 'a whole HTTP status, 400 to 599',
  retryAfterSec: 'a whole number of seconds, 0 to 3600',
}

/** Field-by-field problems with one rule, from the ChaosRule schema plus the two constraints the schema cannot say. */
export function validateRule(rule: ChaosRule, all: readonly ChaosRule[]): RuleErrors {
  const errors: RuleErrors = {}
  const parsed = ChaosRule.safeParse(rule)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (typeof field !== 'string' || !(field in FIELD_NAMES)) continue
      const key = field as keyof ChaosRule
      errors[key] ??= RANGE[key] ? `${FIELD_NAMES[key]} must be ${RANGE[key]}.` : `${FIELD_NAMES[key]}: ${issue.message}`
    }
  }
  if (rule.label.trim() === '') errors.label = 'Label is required: it is what X-Chaos shows.'
  if (!rule.pathPrefix.startsWith('/')) errors.pathPrefix = 'Path prefix must start with / or it can never match a request path.'
  if (isLabPath(rule.pathPrefix)) errors.pathPrefix = '/api/_lab is exempt from chaos; a rule there never fires.'
  if (rule.id.trim() === '' || all.filter((r) => r.id === rule.id).length > 1) errors.id = 'Rule ids must be unique.'
  return errors
}

export function validateState(state: ChaosState): RuleErrors[] {
  return state.rules.map((r) => validateRule(r, state.rules))
}

export const errorCount = (errors: readonly RuleErrors[]): number => errors.reduce((n, e) => n + Object.keys(e).length, 0)

export function blankRule(existing: readonly ChaosRule[]): ChaosRule {
  let n = existing.length + 1
  while (existing.some((r) => r.id === `custom-${n}`)) n += 1
  return { id: `custom-${n}`, label: `Custom rule ${n}`, enabled: false, method: 'ANY', pathPrefix: '/api', latencyMs: 0, jitterMs: 0, probability: 1, mode: 'pass', status: 500, retryAfterSec: 5 }
}

export function duplicateRule(rule: ChaosRule, existing: readonly ChaosRule[]): ChaosRule {
  const copy = blankRule(existing)
  return { ...rule, id: copy.id, label: `${rule.label} (copy)`.slice(0, 100), enabled: false }
}

export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return [...list]
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}
