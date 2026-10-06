// @vitest-environment node
/**
 * Black-box suite for the Outpost server: a real createApp() on an ephemeral port, driven with fetch.
 * Every JSON body is parsed with its schema from shared/contracts.ts, so a drift between the server and
 * the contract fails here before it can fail in a browser.
 *
 * State: VAPID keys, subscriptions and the dist/ directory live in a temp sandbox (OUTPOST_DATA_DIR and
 * OUTPOST_DIST_DIR are set before the server modules are imported). POST /api/_lab/reset runs before each test.
 */
import { createECDH, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  API,
  ApiErrorBody,
  BENCH_KEYS,
  BENCH_STRATEGIES,
  BenchResponse,
  ChaosState,
  Digest,
  Dispatch,
  DispatchPage,
  DriftedDispatch,
  HandbookChapter,
  HandbookIndex,
  HeaderProfileBody,
  InboxSummary,
  LabEvent,
  LabState,
  LabTruth,
  PushSendResult,
  PushSubscriptionInfo,
  PushSubscriptionList,
  PushVapid,
  ReleaseState,
  RequestLogPage,
  SessionControlResult,
  SessionResponse,
  SignalBoard,
  Station,
  StationList,
  VersionInfo,
  WireSpawnResult,
  WireState,
  type ChaosRule,
  type HeaderProfile,
  type RequestLogEntry,
} from '../shared/contracts'
import type { RunningServer } from './index'

// ─── harness ──────────────────────────────────────────────────────────────────
let server: RunningServer
let base = ''
let sandbox = ''
const unhandled: unknown[] = []
const onUnhandled = (reason: unknown): void => {
  unhandled.push(reason)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

beforeAll(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'outpost-test-'))
  const dist = join(sandbox, 'dist')
  mkdirSync(join(dist, 'assets'), { recursive: true })
  mkdirSync(join(dist, 'icons'))
  mkdirSync(join(dist, '.well-known'))
  const files: Record<string, string> = {
    'index.html': '<!doctype html><html><head><title>Outpost</title></head><body><div id="root"></div></body></html>',
    'sw.js': 'self.addEventListener("install", () => {})\n',
    'manifest.webmanifest': '{"name":"Outpost"}',
    'version.json': '{"version":"1.0.0","buildId":"abc","builtAt":"2026-01-01T00:00:00.000Z"}',
    'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'assets/app-abc123.js': 'export const x = 1\n',
    'assets/app-abc123.js.map': '{"version":3}',
    'assets/app-abc123.css': 'body{margin:0}',
    'assets/font-abc123.woff2': 'wOF2',
    'icons/icon-192.png': 'PNG',
    '.env': 'DOTFILE-SECRET',
    '.well-known/assetlinks.json': '[]',
  }
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dist, name), content)
  // A file that exists outside the served directory: a traversal bug would hand it out.
  writeFileSync(join(sandbox, 'secret.txt'), 'OUTSIDE-DIST-SECRET')

  process.env.OUTPOST_DATA_DIR = join(sandbox, 'data')
  process.env.OUTPOST_DIST_DIR = dist
  process.on('unhandledRejection', onUnhandled)
  process.on('uncaughtException', onUnhandled)

  const { start } = await import('./index')
  server = await start(0)
  base = `http://127.0.0.1:${server.port}`
})

afterAll(async () => {
  await server.close()
  process.off('unhandledRejection', onUnhandled)
  process.off('uncaughtException', onUnhandled)
  rmSync(sandbox, { recursive: true, force: true })
})

beforeEach(async () => {
  // The first reset clears any chaos a failed test left behind, so the clean-up calls below cannot be hit by it.
  // Subscriptions survive a reset on purpose, so they are removed here; the second reset wipes those calls from
  // the request log and the counters, which the tests read.
  await call(API.lab.reset, { method: 'POST' })
  const list = PushSubscriptionList.parse((await call(API.pushSubscriptions)).json)
  for (const item of list.items) await call(API.pushUnsubscribe, { json: { id: item.id } })
  await call(API.lab.reset, { method: 'POST' })
})

interface CallOptions {
  method?: string
  json?: unknown
  body?: string
  cookie?: string
  headers?: Record<string, string>
  signal?: AbortSignal
}
interface Reply {
  res: Response
  text: string
  json: unknown
}

async function call(path: string, opts: CallOptions = {}): Promise<Reply> {
  const headers = new Headers(opts.headers)
  if (opts.json !== undefined) headers.set('Content-Type', 'application/json')
  if (opts.cookie) headers.set('Cookie', opts.cookie)
  const res = await fetch(base + path, {
    method: opts.method ?? (opts.json !== undefined || opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
    signal: opts.signal,
  })
  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  return { res, text, json }
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  return schema.parse(value)
}

/** The response is a well-formed ApiErrorBody with this status and code, stamped with its own request id. */
function expectError(reply: Reply, status: number, code: string): z.output<typeof ApiErrorBody>['error'] {
  expect(reply.res.status).toBe(status)
  expect(reply.res.headers.get('content-type')).toContain('application/json')
  const { error } = parse(ApiErrorBody, reply.json)
  expect(error.code).toBe(code)
  expect(error.requestId).toBe(reply.res.headers.get('x-request-id'))
  return error
}

async function ok<S extends z.ZodType>(path: string, schema: S, opts: CallOptions = {}): Promise<z.output<S>> {
  const reply = await call(path, opts)
  expect(reply.res.status, `${opts.method ?? 'GET'} ${path}: ${reply.text.slice(0, 200)}`).toBeLessThan(300)
  return parse(schema, reply.json)
}

async function login(callsign = 'TEST-01'): Promise<string> {
  const reply = await call(API.session, { json: { callsign } })
  expect(reply.res.status).toBe(200)
  const cookie = reply.res.headers.getSetCookie()[0]?.split(';')[0]
  if (!cookie) throw new Error('no session cookie')
  return cookie
}

const baseRule: ChaosRule = {
  id: 't1',
  label: 'test rule',
  enabled: true,
  method: 'ANY',
  pathPrefix: '/api/bench/cache-first',
  latencyMs: 0,
  jitterMs: 0,
  probability: 1,
  mode: 'pass',
  status: 500,
  retryAfterSec: 5,
}

async function setChaos(rule: Partial<ChaosRule> | null, top: { serverOffline?: boolean; schemaDrift?: boolean } = {}): Promise<void> {
  const state = { serverOffline: false, schemaDrift: false, ...top, rules: rule ? [{ ...baseRule, ...rule }] : [] }
  parse(ChaosState, (await call(API.lab.chaos, { method: 'PUT', json: state })).json)
}

async function setProfile(profile: HeaderProfile): Promise<void> {
  parse(HeaderProfileBody, (await call(API.lab.headers, { method: 'PUT', json: { profile } })).json)
}

let draftCounter = 0
function draft(over: Record<string, unknown> = {}): Record<string, unknown> {
  draftCounter += 1
  return { clientId: `client-${String(draftCounter).padStart(6, '0')}`, stationId: 'st-krn07', title: `Test dispatch ${draftCounter}`, body: 'Body text for a test dispatch.', severity: 'notice', ...over }
}

async function file(over: Record<string, unknown> = {}, cookie?: string): Promise<z.output<typeof Dispatch>> {
  const cookieValue = cookie ?? (await login())
  return ok(API.dispatches, Dispatch, { json: draft(over), cookie: cookieValue })
}

async function walk(query = '', limit = 7): Promise<z.output<typeof Dispatch>[]> {
  const items: z.output<typeof Dispatch>[] = []
  let cursor: string | null = null
  for (let pages = 0; pages < 200; pages++) {
    const params = new URLSearchParams(query)
    params.set('limit', String(limit))
    if (cursor) params.set('cursor', cursor)
    const page: z.output<typeof DispatchPage> = await ok(`${API.dispatches}?${params}`, DispatchPage)
    items.push(...page.items)
    cursor = page.nextCursor
    if (!cursor) return items
  }
  throw new Error('cursor walk did not terminate')
}

async function logEntries(): Promise<RequestLogEntry[]> {
  return parse(RequestLogPage, (await call(API.lab.log)).json).entries
}

async function findLog(match: (entry: RequestLogEntry) => boolean): Promise<RequestLogEntry> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const hit = (await logEntries()).filter(match).at(-1)
    if (hit) return hit
    await sleep(25)
  }
  throw new Error('no matching request log entry')
}

const logOf = (reply: Reply): Promise<RequestLogEntry> => findLog((e) => e.requestId === reply.res.headers.get('x-request-id'))

interface RawReply {
  status: number
  headers: IncomingHttpHeaders
  body: string
}
/** Sends the path byte for byte (fetch would normalise `..` and re-encode). */
function raw(path: string, opts: { method?: string; headers?: Record<string, string> } = {}): Promise<RawReply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: server.port, path, method: opts.method ?? 'GET', headers: opts.headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

type Outcome = { kind: 'ok'; reply: Response; text: string } | { kind: 'fetch-rejected'; error: unknown } | { kind: 'body-rejected'; reply: Response; error: unknown }
async function outcome(path: string, init: RequestInit = {}): Promise<Outcome> {
  let reply: Response
  try {
    reply = await fetch(base + path, init)
  } catch (error) {
    return { kind: 'fetch-rejected', error }
  }
  try {
    return { kind: 'ok', reply, text: await reply.text() }
  } catch (error) {
    return { kind: 'body-rejected', reply, error }
  }
}

/** A reader for GET /api/_lab/events that keeps every parsed event and lets a test wait for one. */
async function openEvents(): Promise<{ response: Response; seen: LabEvent[]; names: string[]; waitFor(match: (e: LabEvent) => boolean, ms?: number): Promise<LabEvent>; close(): void }> {
  const controller = new AbortController()
  const response = await fetch(base + API.lab.events, { signal: controller.signal })
  const seen: LabEvent[] = []
  const names: string[] = []
  const reader = response.body?.getReader()
  if (!reader) throw new Error('no stream body')
  const decoder = new TextDecoder()
  let buffer = ''
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        buffer += decoder.decode(value, { stream: true })
        let end = buffer.indexOf('\n\n')
        while (end !== -1) {
          const frame = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const data = frame.split('\n').find((l) => l.startsWith('data: '))
          const name = frame.split('\n').find((l) => l.startsWith('event: '))
          if (data && name) {
            names.push(name.slice(7))
            seen.push(LabEvent.parse(JSON.parse(data.slice(6))))
          }
          end = buffer.indexOf('\n\n')
        }
      }
    } catch {
      // Aborted by close(): expected.
    }
  })()
  return {
    response,
    seen,
    names,
    async waitFor(match, ms = 3000) {
      const deadline = Date.now() + ms
      for (;;) {
        const hit = seen.find(match)
        if (hit) return hit
        if (Date.now() > deadline) throw new Error(`event not seen; got ${JSON.stringify(seen.map((e) => e.type))}`)
        await sleep(15)
      }
    },
    close: () => controller.abort(),
  }
}

const pushKeys = (): { p256dh: string; auth: string } => {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') }
}
/** Nothing listens on port 9, so a send to this endpoint fails fast and offline. */
const deadEndpoint = (tail = 'abcdefghijkl'): string => `https://127.0.0.1:9/push/${tail}`

// ─── every response ───────────────────────────────────────────────────────────
describe('response envelope', () => {
  it('stamps the custom headers on every kind of response', async () => {
    const replies = [await call(API.ping), await call(API.version), await call('/api/nope'), await call(API.lab.state), await call('/media/dispatch/dp-000001.svg')]
    for (const { res } of replies) {
      expect(res.headers.get('x-request-id')).toMatch(/^r-[0-9a-z]{7}$/)
      expect(new Date(res.headers.get('x-served-at') ?? '').toISOString()).toBe(res.headers.get('x-served-at'))
      expect(res.headers.get('x-served-by')).toMatch(/^outpost\/[0-9a-f]{6}$/)
      expect(res.headers.get('x-api-version')).toBe('1')
      expect(res.headers.get('access-control-expose-headers')).toContain('X-Chaos')
      expect(res.headers.has('x-powered-by')).toBe(false)
    }
    expect(new Set(replies.map((r) => r.res.headers.get('x-request-id'))).size).toBe(replies.length)
  })

  it('answers ping with 204 and no body, for GET and HEAD', async () => {
    for (const method of ['GET', 'HEAD']) {
      const reply = await call(API.ping, { method })
      expect(reply.res.status).toBe(204)
      expect(reply.text).toBe('')
      expect(reply.res.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('sets Content-Length that matches the JSON body, and leaves HEAD bodyless', async () => {
    const get = await call(API.dispatches)
    expect(Number(get.res.headers.get('content-length'))).toBe(Buffer.byteLength(get.text))
    const head = await call(API.dispatches, { method: 'HEAD' })
    expect(head.res.status).toBe(200)
    expect(head.text).toBe('')
    expect(head.res.headers.get('content-length')).toBe(get.res.headers.get('content-length'))
  })

  it('reports the X-Api-Version the release simulator sets', async () => {
    await call(API.lab.release, { method: 'PUT', json: { api: 2 } })
    expect((await call(API.ping)).res.headers.get('x-api-version')).toBe('2')
  })
})

// ─── version, session ─────────────────────────────────────────────────────────
describe('version and session', () => {
  it('serves VersionInfo that follows the release simulator', async () => {
    const before = await ok(API.version, VersionInfo)
    expect(before).toMatchObject({ api: 1, latestClient: '1.0.0', minClient: '1.0.0' })
    const state = parse(LabState, (await call(API.lab.state)).json)
    expect(before.serverInstance).toBe(state.serverInstance)

    const release = parse(ReleaseState, (await call(API.lab.release, { method: 'PUT', json: { latestClient: '2.0.0', minClient: '1.5.0', api: 2 } })).json)
    expect(release).toMatchObject({ latestClient: '2.0.0', minClient: '1.5.0', api: 2, handbookEdition: '1988.4' })
    expect(await ok(API.version, VersionInfo)).toMatchObject({ latestClient: '2.0.0', minClient: '1.5.0', api: 2 })
    expectError(await call(API.lab.release, { method: 'PUT', json: { latestClient: 'next' } }), 422, 'validation_failed')
  })

  it('signs in, reads the session back, and signs out', async () => {
    expect((await ok(API.session, SessionResponse)).session).toBeNull()

    const login1 = await call(API.session, { json: { callsign: 'KRN-07' } })
    expect(login1.res.status).toBe(200)
    expect(login1.res.headers.get('cache-control')).toBe('no-store')
    const setCookie = login1.res.headers.getSetCookie()
    expect(setCookie).toHaveLength(1)
    expect(setCookie[0]).toMatch(/^outpost_sid=[\w-]{20,}; HttpOnly; SameSite=Lax; Path=\/; Max-Age=600$/)
    const created = parse(SessionResponse, login1.json).session
    expect(created?.operator).toEqual({ callsign: 'KRN-07', displayName: 'Operator KRN-07' })
    expect(new Date(created?.expiresAt ?? '').getTime() - new Date(created?.issuedAt ?? '').getTime()).toBe(600_000)

    const cookie = setCookie[0]?.split(';')[0] ?? ''
    expect(await ok(API.session, SessionResponse, { cookie })).toEqual({ session: created })

    const out = await call(API.session, { method: 'DELETE', cookie })
    expect(parse(SessionResponse, out.json).session).toBeNull()
    expect(out.res.headers.getSetCookie()[0]).toMatch(/^outpost_sid=; .*Max-Age=0/)
    expect((await ok(API.session, SessionResponse, { cookie })).session).toBeNull()
  })

  it('treats a forged or malformed cookie as signed out', async () => {
    for (const cookie of ['outpost_sid=forged', 'outpost_sid=', 'outpost_sid=%E0%A4%A', 'other=1; outpost_sid="quoted"', 'constructor=1']) {
      expect((await ok(API.session, SessionResponse, { cookie })).session).toBeNull()
    }
  })

  it('rejects an invalid callsign and an unparsable body', async () => {
    for (const callsign of ['x', 'has space', 'waytoolongcallsign-0', '']) {
      expectError(await call(API.session, { json: { callsign } }), 422, 'validation_failed')
    }
    expectError(await call(API.session, { json: {} }), 422, 'validation_failed')
    expectError(await call(API.session, { body: '{nope', headers: { 'Content-Type': 'application/json' } }), 400, 'bad_request')
    expectError(await call(API.session, { method: 'POST' }), 422, 'validation_failed')
  })

  it('logs in again without inheriting the old session', async () => {
    const first = await login('FIRST-1')
    const second = await call(API.session, { json: { callsign: 'SECOND-1' }, cookie: first })
    expect(second.res.status).toBe(200)
    expect((await ok(API.session, SessionResponse, { cookie: first })).session).toBeNull()
  })

  it('expires every session on demand', async () => {
    const cookie = await login()
    const control = parse(SessionControlResult, (await call(API.lab.session, { json: { action: 'expire' } })).json)
    expect(control).toEqual({ sessionTtlSec: 600, sessions: 0 })
    expect((await ok(API.session, SessionResponse, { cookie })).session).toBeNull()
    expectError(await call(API.dispatches, { json: draft(), cookie }), 401, 'unauthorized')
  })

  it('applies a new TTL to later sessions only, and really expires them', async () => {
    const early = await login('EARLY-1')
    parse(SessionControlResult, (await call(API.lab.session, { json: { action: 'set-ttl', ttlSec: 1 } })).json)
    const reply = await call(API.session, { json: { callsign: 'SHORT-1' } })
    expect(reply.res.headers.getSetCookie()[0]).toContain('Max-Age=1')
    const cookie = reply.res.headers.getSetCookie()[0]?.split(';')[0] ?? ''
    expect((await ok(API.session, SessionResponse, { cookie })).session).not.toBeNull()
    expect((await ok(API.session, SessionResponse, { cookie: early })).session).not.toBeNull()
    await sleep(1100)
    expect((await ok(API.session, SessionResponse, { cookie })).session).toBeNull()
    expect((await ok(API.session, SessionResponse, { cookie: early })).session).not.toBeNull()
    expect(parse(LabState, (await call(API.lab.state)).json).counters.sessions).toBe(1)
  })

  it('validates session control bodies', async () => {
    for (const json of [{ action: 'set-ttl', ttlSec: 0 }, { action: 'set-ttl', ttlSec: 100_000 }, { action: 'set-ttl' }, { action: 'nuke' }, {}]) {
      expectError(await call(API.lab.session, { json }), 422, 'validation_failed')
    }
  })
})

// ─── dispatches ───────────────────────────────────────────────────────────────
describe('dispatch list', () => {
  it('returns a DispatchPage, newest first, with the feed revision in a header', async () => {
    const reply = await call(API.dispatches)
    expect(reply.res.status).toBe(200)
    const page = parse(DispatchPage, reply.json)
    expect(page.items).toHaveLength(12)
    expect(page.total).toBeGreaterThanOrEqual(50)
    expect(page.nextCursor).toEqual(expect.any(String))
    expect(reply.res.headers.get('x-resource-rev')).toBe(String(page.feedRev))
    expect(reply.res.headers.get('etag')).toMatch(/^W\/"/)
    for (let i = 1; i < page.items.length; i++) expect((page.items[i - 1]?.filedAt ?? '') >= (page.items[i]?.filedAt ?? '')).toBe(true)
    for (const item of page.items) expect(item.imageUrl).toBe(`/media/dispatch/${item.id}.svg`)
  })

  it('walks every dispatch by cursor with no duplicates, gaps or reordering, at any page size', async () => {
    const total = parse(DispatchPage, (await call(`${API.dispatches}?limit=1`)).json).total
    const reference = await walk('', 50)
    expect(reference).toHaveLength(total)
    expect(new Set(reference.map((d) => d.id)).size).toBe(total)
    for (let i = 1; i < reference.length; i++) {
      const [a, b] = [reference[i - 1], reference[i]]
      expect(a && b && (a.filedAt > b.filedAt || (a.filedAt === b.filedAt && a.id > b.id))).toBe(true)
    }
    for (const limit of [1, 7, 8, 13]) expect((await walk('', limit)).map((d) => d.id), `limit ${limit}`).toEqual(reference.map((d) => d.id))
  })

  it('ends with a null cursor exactly when nothing is left, including on an exact page boundary', async () => {
    const total = parse(DispatchPage, (await call(`${API.dispatches}?limit=1`)).json).total
    const last = parse(DispatchPage, (await call(`${API.dispatches}?limit=50`)).json)
    expect(last.nextCursor).not.toBeNull()
    const second = parse(DispatchPage, (await call(`${API.dispatches}?limit=50&cursor=${encodeURIComponent(last.nextCursor ?? '')}`)).json)
    expect(second.items).toHaveLength(total - 50)
    expect(second.nextCursor).toBeNull()
    const critical = parse(DispatchPage, (await call(`${API.dispatches}?severity=critical&limit=1`)).json).total
    expect(critical).toBeLessThanOrEqual(50)
    const exact = parse(DispatchPage, (await call(`${API.dispatches}?severity=critical&limit=${critical}`)).json)
    expect(exact.items).toHaveLength(critical)
    expect(exact.nextCursor).toBeNull()
    expect(parse(DispatchPage, (await call(`${API.dispatches}?severity=critical&limit=${critical - 1}`)).json).nextCursor).not.toBeNull()
  })

  it('keeps paging stable while new dispatches are filed between requests', async () => {
    const reference = (await walk('', 50)).map((d) => d.id)
    const first = parse(DispatchPage, (await call(`${API.dispatches}?limit=10`)).json)
    const filed = await file()
    const rest: string[] = []
    let cursor = first.nextCursor
    while (cursor) {
      const page: z.output<typeof DispatchPage> = parse(DispatchPage, (await call(`${API.dispatches}?limit=10&cursor=${encodeURIComponent(cursor)}`)).json)
      rest.push(...page.items.map((d) => d.id))
      cursor = page.nextCursor
    }
    expect([...first.items.map((d) => d.id), ...rest]).toEqual(reference)
    expect(rest).not.toContain(filed.id)
  })

  it('filters by severity, station, text, read state and star, and combines them', async () => {
    const all = await walk('', 50)
    const ids = async (query: string): Promise<string[]> => (await walk(query, 50)).map((d) => d.id)
    const expected = (pred: (d: z.output<typeof Dispatch>) => boolean): string[] => all.filter(pred).map((d) => d.id)

    for (const severity of ['routine', 'notice', 'urgent', 'critical']) {
      const got = await ids(`severity=${severity}`)
      expect(got.length).toBeGreaterThan(0)
      expect(got).toEqual(expected((d) => d.severity === severity))
    }
    const code = all[0]?.stationCode ?? ''
    expect(await ids(`station=${code}`)).toEqual(expected((d) => d.stationCode === code))
    expect(await ids(`station=${code.toLowerCase()}`)).toEqual(expected((d) => d.stationCode === code))
    expect(await ids(`station=${all[0]?.stationId ?? ''}`)).toEqual(expected((d) => d.stationCode === code))

    const word = (all[5]?.title.split(/\W+/).find((w) => w.length >= 5) ?? '').toLowerCase()
    const hay = (d: z.output<typeof Dispatch>): string => `${d.title}\n${d.body}\n${d.tags.join(' ')}\n${d.stationCode}`.toLowerCase()
    expect(word).not.toBe('')
    expect(await ids(`q=${word.toUpperCase()}`)).toEqual(expected((d) => hay(d).includes(word)))
    expect(await ids(`q=${encodeURIComponent(code)}`)).toEqual(expected((d) => hay(d).includes(code.toLowerCase())))
    expect(await ids('q=zzzz-no-such-text')).toEqual([])

    expect(await ids('unread=true')).toEqual(expected((d) => !d.read))
    expect(await ids('unread=false')).toEqual(expected((d) => d.read))
    expect(await ids('unread=1')).toEqual(expected((d) => !d.read))
    expect(await ids('starred=true')).toEqual([])
    const target = all[3]
    await call(API.dispatch(target?.id ?? ''), { method: 'PATCH', json: { starred: true } })
    expect(await ids('starred=true')).toEqual([target?.id])
    expect(await ids('starred=false')).toHaveLength(all.length - 1)

    expect(await ids(`severity=urgent&unread=true&station=${code}`)).toEqual(expected((d) => d.severity === 'urgent' && !d.read && d.stationCode === code))
    const page = parse(DispatchPage, (await call(`${API.dispatches}?severity=critical&limit=1`)).json)
    expect(page.total).toBe(expected((d) => d.severity === 'critical').length)
  })

  it('treats empty filter values as absent and rejects bad ones with a 422', async () => {
    const plain = parse(DispatchPage, (await call(`${API.dispatches}?limit=50`)).json)
    const empty = parse(DispatchPage, (await call(`${API.dispatches}?limit=50&severity=&station=&q=&unread=&starred=&cursor=`)).json)
    expect(empty).toEqual(plain)
    for (const query of ['severity=bogus', 'limit=0', 'limit=51', 'limit=abc', 'limit=1.5', 'unread=maybe', 'severity=routine&severity=urgent', 'q=a&q=b']) {
      expectError(await call(`${API.dispatches}?${query}`), 422, 'validation_failed')
    }
    for (const cursor of ['garbage', 'bm90LWEtY3Vyc29y', Buffer.from('not-a-date|dp-000001').toString('base64url')]) {
      expectError(await call(`${API.dispatches}?cursor=${cursor}`), 400, 'bad_request')
    }
  })
})

describe('dispatch detail and validators', () => {
  it('returns one Dispatch with W/"id-rN" and the revision header', async () => {
    const reply = await call(API.dispatch('dp-000064'))
    const dispatch = parse(Dispatch, reply.json)
    expect(dispatch).toMatchObject({ id: 'dp-000064', rev: 1, clientId: null })
    expect(reply.res.headers.get('etag')).toBe('W/"dp-000064-r1"')
    expect(reply.res.headers.get('x-resource-rev')).toBe('1')
    expect(reply.res.headers.get('cache-control')).toBe('no-cache')
    expectError(await call(API.dispatch('dp-999999')), 404, 'not_found')
    expectError(await call('/api/dispatches/dp-000064/extra'), 404, 'not_found')
  })

  it('answers 304 for a matching If-None-Match in every spelling, and notes it in the log', async () => {
    const etag = 'W/"dp-000064-r1"'
    for (const header of [etag, '"dp-000064-r1"', `"nope", ${etag}`, '*']) {
      const reply = await call(API.dispatch('dp-000064'), { headers: { 'If-None-Match': header, 'Cache-Control': 'no-cache' } })
      expect(reply.res.status, header).toBe(304)
      expect(reply.text).toBe('')
      expect(reply.res.headers.get('etag')).toBe(etag)
      expect(reply.res.headers.get('x-resource-rev')).toBe('1')
    }
    const last = await call(API.dispatch('dp-000064'), { headers: { 'If-None-Match': etag } })
    expect((await logOf(last)).notes).toContain('etag-304')
    expect((await logOf(last)).reqHeaders['if-none-match']).toBe(etag)
    expect((await call(API.dispatch('dp-000064'), { headers: { 'If-None-Match': 'W/"dp-000064-r2"' } })).res.status).toBe(200)
    expect((await call(API.dispatch('dp-000064'), { method: 'HEAD', headers: { 'If-None-Match': etag } })).res.status).toBe(304)
  })

  it('never answers 304 to a write, and stops answering 304 once the revision moves', async () => {
    const cookie = await login()
    const created = await call(API.dispatches, { json: draft(), cookie, headers: { 'If-None-Match': '*' } })
    expect(created.res.status).toBe(201)
    const id = parse(Dispatch, created.json).id
    const etag = created.res.headers.get('etag') ?? ''
    expect((await call(API.dispatch(id), { headers: { 'If-None-Match': etag } })).res.status).toBe(304)
    await call(API.dispatch(id), { method: 'PATCH', json: { starred: true } })
    const after = await call(API.dispatch(id), { headers: { 'If-None-Match': etag } })
    expect(after.res.status).toBe(200)
    expect(after.res.headers.get('etag')).toBe(`W/"${id}-r2"`)
  })

  it('validates list responses too, and invalidates them when any dispatch changes', async () => {
    const first = await call(`${API.dispatches}?limit=3`)
    const etag = first.res.headers.get('etag') ?? ''
    expect((await call(`${API.dispatches}?limit=3`, { headers: { 'If-None-Match': etag } })).res.status).toBe(304)
    const id = parse(DispatchPage, first.json).items[0]?.id ?? ''
    await call(API.dispatch(id), { method: 'PATCH', json: { starred: true } })
    expect((await call(`${API.dispatches}?limit=3`, { headers: { 'If-None-Match': etag } })).res.status).toBe(200)
  })
})

describe('creating dispatches', () => {
  it('needs a session (401 with a log note), then answers 201 with a Location', async () => {
    const denied = await call(API.dispatches, { json: draft() })
    expectError(denied, 401, 'unauthorized')
    expect((await logOf(denied)).notes).toContain('unauthorized')
    expect(parse(DispatchPage, (await call(API.dispatches)).json).total).toBe(parse(LabState, (await call(API.lab.state)).json).counters.dispatches)

    const cookie = await login('KRN-07')
    const reply = await call(API.dispatches, { json: draft({ tags: ['ice', 'mast'], coords: { lat: 1.5, lng: 2.5 } }), cookie })
    expect(reply.res.status).toBe(201)
    const created = parse(Dispatch, reply.json)
    expect(reply.res.headers.get('location')).toBe(`/api/dispatches/${created.id}`)
    expect(reply.res.headers.get('etag')).toBe(`W/"${created.id}-r1"`)
    expect(reply.res.headers.has('idempotent-replay')).toBe(false)
    expect(created).toMatchObject({ filedBy: 'KRN-07', stationCode: 'KRN-07', read: false, acked: false, starred: false, rev: 1, tags: ['ice', 'mast'], coords: { lat: 1.5, lng: 2.5 } })
    expect(await ok(API.dispatch(created.id), Dispatch)).toEqual(created)
    expect((await walk('', 50))[0]?.id).toBe(created.id)
  })

  it('accepts a station code in any case and stores the station id', async () => {
    const created = await file({ stationId: 'krn-07' })
    expect(created).toMatchObject({ stationId: 'st-krn07', stationCode: 'KRN-07' })
  })

  it('replays an idempotency key with 200, the header and the same dispatch', async () => {
    const cookie = await login()
    const before = parse(DispatchPage, (await call(API.dispatches)).json).total
    const key = 'idem-key-0001'
    const body = draft({ clientId: undefined })
    const first = await call(API.dispatches, { json: body, cookie, headers: { 'Idempotency-Key': key } })
    expect(first.res.status).toBe(201)
    const created = parse(Dispatch, first.json)
    expect(created.clientId).toBe(key)

    const replay = await call(API.dispatches, { json: { ...body, title: 'A different title' }, cookie, headers: { 'Idempotency-Key': key } })
    expect(replay.res.status).toBe(200)
    expect(replay.res.headers.get('idempotent-replay')).toBe('true')
    expect(parse(Dispatch, replay.json)).toEqual(created)
    expect((await logOf(replay)).notes).toContain('idempotent-replay')
    expect(parse(DispatchPage, (await call(API.dispatches)).json).total).toBe(before + 1)
  })

  it('falls back to the body clientId, and lets the header win when both are sent', async () => {
    const cookie = await login()
    const body = draft({ clientId: 'body-client-id-1' })
    const a = await call(API.dispatches, { json: body, cookie })
    expect(a.res.status).toBe(201)
    const replay = await call(API.dispatches, { json: body, cookie })
    expect([replay.res.status, replay.res.headers.get('idempotent-replay')]).toEqual([200, 'true'])
    expect(parse(Dispatch, replay.json).id).toBe(parse(Dispatch, a.json).id)

    const both = await call(API.dispatches, { json: draft({ clientId: 'body-client-id-2' }), cookie, headers: { 'Idempotency-Key': 'header-key-0001' } })
    expect(parse(Dispatch, both.json).clientId).toBe('header-key-0001')
  })

  it('files exactly one dispatch when twenty identical requests race', async () => {
    const cookie = await login()
    const before = parse(DispatchPage, (await call(API.dispatches)).json).total
    const body = draft()
    const replies = await Promise.all(Array.from({ length: 20 }, () => call(API.dispatches, { json: body, cookie })))
    expect(replies.filter((r) => r.res.status === 201)).toHaveLength(1)
    expect(replies.filter((r) => r.res.status === 200 && r.res.headers.get('idempotent-replay') === 'true')).toHaveLength(19)
    expect(new Set(replies.map((r) => parse(Dispatch, r.json).id)).size).toBe(1)
    expect(parse(DispatchPage, (await call(API.dispatches)).json).total).toBe(before + 1)
  })

  it('believes filedAtClient only when it is not in the future', async () => {
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
    const past = await file({ filedAtClient: hourAgo })
    expect(past.filedAt).toBe(hourAgo)
    const future = await file({ filedAtClient: new Date(Date.now() + 3_600_000).toISOString() })
    expect(new Date(future.filedAt).getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('rejects invalid input with 422 and the zod issues in details', async () => {
    const cookie = await login()
    const cases: [string, Record<string, unknown>, string][] = [
      ['title too short', { title: 'ab' }, 'title'],
      ['title too long', { title: 'x'.repeat(121) }, 'title'],
      ['empty body', { body: '' }, 'body'],
      ['bad severity', { severity: 'panic' }, 'severity'],
      ['too many tags', { tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }, 'tags'],
      ['short clientId', { clientId: 'short' }, 'clientId'],
      ['bad filedAtClient', { filedAtClient: 'yesterday' }, 'filedAtClient'],
    ]
    for (const [name, over, field] of cases) {
      const reply = await call(API.dispatches, { json: draft(over), cookie })
      const error = expectError(reply, 422, 'validation_failed')
      expect(Array.isArray(error.details), name).toBe(true)
      expect(JSON.stringify(error.details), name).toContain(field)
      expect((await logOf(reply)).notes, name).toContain('validation-failed')
    }
    const unknownStation = expectError(await call(API.dispatches, { json: draft({ stationId: 'st-nowhere' }), cookie }), 422, 'validation_failed')
    expect(JSON.stringify(unknownStation.details)).toContain('stationId')
    expectError(await call(API.dispatches, { json: draft({ clientId: undefined }), cookie }), 422, 'validation_failed')
    expectError(await call(API.dispatches, { json: [], cookie }), 422, 'validation_failed')
  })

  it('answers 400 for unparsable JSON, 413 for an oversized body, and never 5xx', async () => {
    const cookie = await login()
    const json = { 'Content-Type': 'application/json' }
    expectError(await call(API.dispatches, { body: '{"title":', cookie, headers: json }), 400, 'bad_request')
    expectError(await call(API.dispatches, { body: '"nonsense"', cookie, headers: json }), 400, 'bad_request')
    expectError(await call(API.dispatches, { body: JSON.stringify({ body: 'x'.repeat(300_000) }), cookie, headers: json }), 413, 'bad_request')
    expectError(await call(API.dispatches, { body: 'plain text', cookie, headers: { 'Content-Type': 'text/plain' } }), 422, 'validation_failed')
  })
})

describe('patching dispatches', () => {
  it('lets read and starred change without a session, and bumps the revision and validator', async () => {
    const reply = await call(API.dispatch('dp-000064'), { method: 'PATCH', json: { read: true, starred: true } })
    const patched = parse(Dispatch, reply.json)
    expect(patched).toMatchObject({ rev: 2, read: true, starred: true })
    expect(reply.res.headers.get('etag')).toBe('W/"dp-000064-r2"')
    expect(reply.res.headers.get('x-resource-rev')).toBe('2')
    expect(await ok(API.dispatch('dp-000064'), Dispatch)).toEqual(patched)
  })

  it('needs a session only for acked', async () => {
    const denied = await call(API.dispatch('dp-000064'), { method: 'PATCH', json: { acked: true } })
    expectError(denied, 401, 'unauthorized')
    expect((await logOf(denied)).notes).toContain('unauthorized')
    expect((await ok(API.dispatch('dp-000064'), Dispatch)).acked).toBe(false)
    const cookie = await login()
    expect(await ok(API.dispatch('dp-000064'), Dispatch, { method: 'PATCH', json: { acked: true }, cookie })).toMatchObject({ acked: true, rev: 2 })
  })

  it('treats a patch that changes nothing as a 200 that keeps rev and ETag', async () => {
    await call(API.dispatch('dp-000064'), { method: 'PATCH', json: { read: true } })
    const again = await call(API.dispatch('dp-000064'), { method: 'PATCH', json: { read: true } })
    expect(again.res.status).toBe(200)
    expect(parse(Dispatch, again.json).rev).toBe(2)
    expect(again.res.headers.get('etag')).toBe('W/"dp-000064-r2"')
    const feedRev = parse(DispatchPage, (await call(API.dispatches)).json).feedRev
    await call(API.dispatch('dp-000064'), { method: 'PATCH', json: { read: true } })
    expect(parse(DispatchPage, (await call(API.dispatches)).json).feedRev).toBe(feedRev)
  })

  it('rejects empty, unknown-only and mistyped patches, and unknown ids', async () => {
    for (const json of [{}, { foo: 1 }, { read: 'yes' }, { starred: null }]) expectError(await call(API.dispatch('dp-000064'), { method: 'PATCH', json }), 422, 'validation_failed')
    expectError(await call(API.dispatch('dp-999999'), { method: 'PATCH', json: { read: true } }), 404, 'not_found')
    expectError(await call(API.dispatch('dp-000064'), { method: 'PATCH', body: '{', headers: { 'Content-Type': 'application/json' } }), 400, 'bad_request')
  })

  it('answers 412 with the current dispatch when If-Match is stale, and leaves the resource alone', async () => {
    await call(API.dispatch('dp-000064'), { method: 'PATCH', json: { starred: true } })
    const stale = await call(API.dispatch('dp-000064'), { method: 'PATCH', json: { read: true }, headers: { 'If-Match': 'W/"dp-000064-r1"' } })
    const error = expectError(stale, 412, 'conflict')
    const current = parse(Dispatch, (error.details as { current: unknown }).current)
    expect(current).toMatchObject({ id: 'dp-000064', rev: 2, starred: true })
    expect(stale.res.headers.get('etag')).toBe('W/"dp-000064-r2"')
    expect(stale.res.headers.get('x-resource-rev')).toBe('2')
    expect((await logOf(stale)).notes).toContain('if-match-412')
    expect(await ok(API.dispatch('dp-000064'), Dispatch)).toEqual(current)
  })

  it('applies a matching If-Match in weak, strong and wildcard form; the second of two racing writers loses', async () => {
    for (const [id, header] of [['dp-000064', 'W/"dp-000064-r1"'], ['dp-000063', '"dp-000063-r1"'], ['dp-000062', '*']]) {
      expect((await call(API.dispatch(id ?? ''), { method: 'PATCH', json: { starred: true }, headers: { 'If-Match': header ?? '' } })).res.status, header).toBe(200)
    }

    const a = await call(API.dispatch('dp-000061'), { method: 'PATCH', json: { starred: true }, headers: { 'If-Match': 'W/"dp-000061-r1"' } })
    const b = await call(API.dispatch('dp-000061'), { method: 'PATCH', json: { read: true }, headers: { 'If-Match': 'W/"dp-000061-r1"' } })
    expect([a.res.status, b.res.status]).toEqual([200, 412])
  })

  it('answers 412 before doing nothing even for a patch that would be a no-op', async () => {
    const reply = await call(API.dispatch('dp-000064'), { method: 'PATCH', json: { read: false }, headers: { 'If-Match': 'W/"dp-000064-r7"' } })
    expectError(reply, 412, 'conflict')
  })
})

// ─── inbox and digest ─────────────────────────────────────────────────────────
describe('inbox and digest', () => {
  it('summarises the inbox and keeps a count-based validator that ignores asOf', async () => {
    const reply = await call(API.inbox)
    const summary = parse(InboxSummary, reply.json)
    const all = await walk('', 50)
    expect(summary.total).toBe(all.length)
    expect(summary.unread).toBe(all.filter((d) => !d.read).length)
    expect(summary.urgentUnread).toBe(all.filter((d) => !d.read && (d.severity === 'urgent' || d.severity === 'critical')).length)
    expect(summary.unread).toBeGreaterThan(0)
    expect(reply.res.headers.get('x-resource-rev')).toBe(String(summary.feedRev))

    const etag = reply.res.headers.get('etag') ?? ''
    await sleep(5)
    expect((await call(API.inbox, { headers: { 'If-None-Match': etag } })).res.status).toBe(304)
    const unread = all.find((d) => !d.read)
    await call(API.dispatch(unread?.id ?? ''), { method: 'PATCH', json: { read: true } })
    const after = await call(API.inbox, { headers: { 'If-None-Match': etag } })
    expect(after.res.status).toBe(200)
    expect(parse(InboxSummary, after.json).unread).toBe(summary.unread - 1)
  })

  it('marks everything read, and a second call changes nothing', async () => {
    const first = parse(InboxSummary, (await call(API.inboxReadAll, { method: 'POST' })).json)
    expect(first).toMatchObject({ unread: 0, urgentUnread: 0 })
    expect((await walk('', 50)).every((d) => d.read)).toBe(true)
    const second = parse(InboxSummary, (await call(API.inboxReadAll, { method: 'POST' })).json)
    expect(second.feedRev).toBe(first.feedRev)
    expect((await ok(API.dispatch('dp-000064'), Dispatch)).rev).toBe(2)
  })

  it('builds a digest of the last 24 hours by default and honours since', async () => {
    const reply = await call(API.digest)
    const digest = parse(Digest, reply.json)
    expect(digest.since).toBeNull()
    expect(digest.items.length).toBeLessThanOrEqual(20)
    expect(digest.newCount).toBeGreaterThanOrEqual(digest.items.length)
    const dayAgo = Date.now() - 86_400_000
    for (const item of digest.items) expect(new Date(item.filedAt).getTime()).toBeGreaterThan(dayAgo)
    expect(digest.unread).toBe(parse(InboxSummary, (await call(API.inbox)).json).unread)

    const week = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const wide = await ok(`${API.digest}?since=${encodeURIComponent(week)}`, Digest)
    expect(wide.since).toBe(week)
    expect(wide.items).toHaveLength(20)
    expect(wide.newCount).toBeGreaterThan(20)

    const future = await ok(`${API.digest}?since=${encodeURIComponent(new Date(Date.now() + 3_600_000).toISOString())}`, Digest)
    expect(future).toMatchObject({ newCount: 0, urgentCount: 0, items: [] })
    expect((await ok(`${API.digest}?since=${encodeURIComponent('2026-01-01T00:00:00+02:00')}`, Digest)).since).toBe('2025-12-31T22:00:00.000Z')
    expectError(await call(`${API.digest}?since=yesterday`), 422, 'validation_failed')
  })

  it('counts a new dispatch in the digest and invalidates its validator', async () => {
    const since = new Date().toISOString()
    const first = await call(`${API.digest}?since=${encodeURIComponent(since)}`)
    const etag = first.res.headers.get('etag') ?? ''
    expect(parse(Digest, first.json).newCount).toBe(0)
    expect((await call(`${API.digest}?since=${encodeURIComponent(since)}`, { headers: { 'If-None-Match': etag } })).res.status).toBe(304)
    const created = await file({ severity: 'critical' })
    const after = await call(`${API.digest}?since=${encodeURIComponent(since)}`, { headers: { 'If-None-Match': etag } })
    expect(after.res.status).toBe(200)
    const digest = parse(Digest, after.json)
    expect(digest).toMatchObject({ newCount: 1, urgentCount: 1 })
    expect(digest.items[0]?.id).toBe(created.id)
  })
})

// ─── stations and signal ──────────────────────────────────────────────────────
describe('stations and signal', () => {
  it('lists stations with a revision-based validator and serves each by code or id', async () => {
    const reply = await call(API.stations)
    const list = parse(StationList, reply.json)
    expect(list.items).toHaveLength(10)
    const etag = reply.res.headers.get('etag') ?? ''
    await sleep(5)
    expect((await call(API.stations, { headers: { 'If-None-Match': etag } })).res.status).toBe(304)

    const first = list.items[0]
    const byCode = await call(API.station(first?.code ?? ''))
    expect(parse(Station, byCode.json)).toEqual(first)
    expect(byCode.res.headers.get('etag')).toBe(`W/"${first?.id}-r${first?.rev}"`)
    expect(parse(Station, (await call(API.station((first?.code ?? '').toLowerCase()))).json)).toEqual(first)
    expect(parse(Station, (await call(API.station(first?.id ?? ''))).json)).toEqual(first)
    expect((await call(API.station(first?.id ?? ''), { headers: { 'If-None-Match': byCode.res.headers.get('etag') ?? '' } })).res.status).toBe(304)
    expectError(await call(API.station('NOPE-99')), 404, 'not_found')
  })

  it('serves a signal board whose seq grows on every call, uncacheable', async () => {
    const a = await call(API.signal, { headers: { 'If-None-Match': '*' } })
    const b = await call(API.signal)
    const boardA = parse(SignalBoard, a.json)
    const boardB = parse(SignalBoard, b.json)
    expect(a.res.status).toBe(200)
    expect(boardB.seq).toBe(boardA.seq + 1)
    expect(boardA.readings).toHaveLength(10)
    for (const reading of boardA.readings) {
      expect(reading.stationCode).toMatch(/^[A-Z]+-\d+$/)
      if (reading.status === 'dark') expect([reading.rssiDbm, reading.snrDb, reading.latencyMs]).toEqual([-128, 0, 0])
      else expect(reading.rssiDbm).toBeGreaterThan(-128)
    }
    for (const reply of [a, b]) {
      expect(reply.res.headers.get('cache-control')).toBe('no-store')
      expect(reply.res.headers.has('etag')).toBe(false)
    }
  })
})

// ─── handbook ─────────────────────────────────────────────────────────────────
describe('handbook', () => {
  it('serves the index and all eight chapters, with validators', async () => {
    const indexReply = await call(API.handbook)
    const index = parse(HandbookIndex, indexReply.json)
    expect(index.chapters).toHaveLength(8)
    expect(index.chapters.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(index.chapters.some((c) => /loss of contact/i.test(c.title))).toBe(true)
    expect((await call(API.handbook, { headers: { 'If-None-Match': indexReply.res.headers.get('etag') ?? '' } })).res.status).toBe(304)

    for (const meta of index.chapters) {
      const reply = await call(API.handbookChapter(meta.slug))
      const chapter = parse(HandbookChapter, reply.json)
      expect(chapter).toMatchObject({ slug: meta.slug, number: meta.number, title: meta.title, edition: index.edition })
      expect(chapter.blocks.length).toBeGreaterThan(2)
      expect((await call(API.handbookChapter(meta.slug), { headers: { 'If-None-Match': reply.res.headers.get('etag') ?? '' } })).res.status).toBe(304)
    }
    expectError(await call(API.handbookChapter('no-such-chapter')), 404, 'not_found')
  })

  it('changes edition and validators only through the release simulator', async () => {
    const before = await call(API.handbook)
    const slug = parse(HandbookIndex, before.json).chapters[0]?.slug ?? ''
    const chapterBefore = await call(API.handbookChapter(slug))
    await call(API.lab.release, { method: 'PUT', json: { handbookEdition: '1989.1' } })
    const after = await call(API.handbook, { headers: { 'If-None-Match': before.res.headers.get('etag') ?? '' } })
    expect(after.res.status).toBe(200)
    expect(parse(HandbookIndex, after.json).edition).toBe('1989.1')
    const chapterAfter = await call(API.handbookChapter(slug), { headers: { 'If-None-Match': chapterBefore.res.headers.get('etag') ?? '' } })
    expect(chapterAfter.res.status).toBe(200)
    expect(parse(HandbookChapter, chapterAfter.json).edition).toBe('1989.1')
  })
})

// ─── bench ────────────────────────────────────────────────────────────────────
describe('strategy bench', () => {
  it('serves every strategy x key, counting server answers only', async () => {
    const instance = (await ok(API.version, VersionInfo)).serverInstance
    for (const strategy of BENCH_STRATEGIES) {
      for (const key of BENCH_KEYS) {
        const reply = await call(API.bench(strategy, key))
        const first = parse(BenchResponse, reply.json)
        expect(first, `${strategy}/${key}`).toMatchObject({ strategy, key, rev: 1, hits: 1, serverInstance: instance })
        expect(first.requestId).toBe(reply.res.headers.get('x-request-id'))
        expect(reply.res.headers.get('x-resource-rev')).toBe('1')
        expect(reply.res.headers.has('etag')).toBe(false)
        const second = await ok(API.bench(strategy, key), BenchResponse)
        expect(second.hits).toBe(2)
        expect(second.payload).toEqual(first.payload)
      }
    }
  })

  it('bumps one key only, changing its rev and its sample', async () => {
    const before = await ok(API.bench('cache-first', 'alpha'), BenchResponse)
    const bump = await call(API.benchBump('cache-first', 'alpha'), { method: 'POST' })
    expect(bump.res.status).toBe(200)
    expect(bump.json).toEqual({ rev: 2 })
    const after = await ok(API.bench('cache-first', 'alpha'), BenchResponse)
    expect(after.rev).toBe(2)
    expect(after.payload.sample).not.toBe(before.payload.sample)
    expect(after.hits).toBe(2)
    expect((await ok(API.bench('network-first', 'alpha'), BenchResponse)).rev).toBe(1)
    const truth = parse(LabTruth, (await call(API.lab.truth)).json)
    expect(truth.bench.find((b) => b.strategy === 'cache-first' && b.key === 'alpha')).toEqual({ strategy: 'cache-first', key: 'alpha', rev: 2, hits: 2 })
    expect(truth.bench).toHaveLength(20)
  })

  it('answers 404 JSON for unknown strategies, keys and methods', async () => {
    expectError(await call(API.bench('cache-first', 'omega')), 404, 'not_found')
    expectError(await call(API.benchBump('cache-first', 'omega'), { method: 'POST' }), 404, 'not_found')
    expectError(await call('/api/bench/telepathy/alpha'), 404, 'not_found')
    expectError(await call('/api/bench/telepathy/alpha/bump', { method: 'POST' }), 404, 'not_found')
    expectError(await call(API.bench('cache-first', 'alpha'), { method: 'DELETE' }), 404, 'not_found')
    expectError(await call(API.bench('cache-first', 'alpha') + '/'), 404, 'not_found')
    expectError(await call('/api/bench/cache-first/%E0%A4%A'), 400, 'bad_request')
  })
})

// ─── lab ──────────────────────────────────────────────────────────────────────
describe('lab endpoints', () => {
  it('reports state, counters and the twelve stock chaos rules', async () => {
    const state = parse(LabState, (await call(API.lab.state)).json)
    expect(state).toMatchObject({ headerProfile: 'realistic', sessionTtlSec: 600, wire: { auto: false, everySec: 20, pushOnNew: false } })
    expect(state.chaos).toMatchObject({ serverOffline: false, schemaDrift: false })
    expect(state.chaos.rules).toHaveLength(12)
    expect(state.chaos.rules.every((r) => !r.enabled)).toBe(true)
    expect(new Set(state.chaos.rules.map((r) => r.id)).size).toBe(12)
    expect(new Set(state.chaos.rules.map((r) => r.mode))).toEqual(new Set(['pass', 'status', 'drop', 'hang', 'html-200', 'empty-200', 'corrupt-json', 'truncate-json', 'slow-body', 'rate-limit']))
    const before = state.counters.requests
    await call(API.ping)
    await call(API.ping)
    expect(parse(LabState, (await call(API.lab.state)).json).counters.requests).toBe(before + 2)
  })

  it('reports the truth the server holds, including the caller session', async () => {
    const cookie = await login('TRUTH-1')
    const target = await file({}, cookie)
    await call(API.dispatch(target.id), { method: 'PATCH', json: { starred: true, read: true } })
    const truth = parse(LabTruth, (await call(API.lab.truth, { cookie })).json)
    expect(truth.session?.operator.callsign).toBe('TRUTH-1')
    expect(truth.dispatches.find((d) => d.id === target.id)).toEqual({ id: target.id, rev: 2, read: true, acked: false, starred: true })
    expect(truth.dispatches).toHaveLength(parse(LabState, (await call(API.lab.state)).json).counters.dispatches)
    expect(truth.stations).toHaveLength(10)
    expect(truth.handbookEdition).toBe('1988.4')
    expect(truth.feedRev).toBe(truth.inbox.feedRev)
    expect(parse(LabTruth, (await call(API.lab.truth)).json).session).toBeNull()
  })

  it('validates and stores chaos state, and reflects it in state', async () => {
    const good = { serverOffline: false, schemaDrift: false, rules: [{ ...baseRule, enabled: false }] }
    expect(parse(ChaosState, (await call(API.lab.chaos, { method: 'PUT', json: good })).json)).toEqual(good)
    expect(parse(ChaosState, (await call(API.lab.chaos)).json)).toEqual(good)
    expect(parse(LabState, (await call(API.lab.state)).json).chaos).toEqual(good)
    const bad: unknown[] = [
      { ...good, rules: [{ ...baseRule, probability: 2 }] },
      { ...good, rules: [{ ...baseRule, mode: 'explode' }] },
      { ...good, rules: [{ ...baseRule, status: 200 }] },
      { ...good, rules: [{ ...baseRule, latencyMs: 60_001 }] },
      { ...good, rules: [baseRule, baseRule] },
      { ...good, rules: Array.from({ length: 51 }, (_, i) => ({ ...baseRule, id: `r${i}` })) },
      { serverOffline: true },
      [],
    ]
    for (const json of bad) expectError(await call(API.lab.chaos, { method: 'PUT', json }), 422, 'validation_failed')
    expect(parse(ChaosState, (await call(API.lab.chaos)).json)).toEqual(good)
  })

  it('toggles presets, re-adds deleted stock rules and rejects unknown names', async () => {
    const preset = async (name: string): Promise<z.output<typeof ChaosState>> => ok(`${API.lab.chaos}/preset/${name}`, ChaosState, { method: 'POST' })
    const rule = (state: z.output<typeof ChaosState>, id: string): ChaosRule | undefined => state.rules.find((r) => r.id === id)

    expect(rule(await preset('lie-fi'), 'lie-fi')?.enabled).toBe(true)
    expect(rule(await preset('lie-fi'), 'lie-fi')?.enabled).toBe(false)
    expect((await preset('hard-down')).serverOffline).toBe(true)
    expect((await preset('hard-down')).serverOffline).toBe(false)
    expect((await preset('schema-drift')).schemaDrift).toBe(true)
    await preset('flaky')
    expect(await preset('all-clear')).toMatchObject({ serverOffline: false, schemaDrift: false })
    expect((await preset('all-clear')).rules.every((r) => !r.enabled)).toBe(true)

    await setChaos(null)
    expect(rule(await preset('flaky'), 'flaky')).toMatchObject({ enabled: true, mode: 'status', probability: 0.3 })
    expectError(await call(`${API.lab.chaos}/preset/nope`, { method: 'POST' }), 404, 'not_found')
  })

  it('updates the wire state partially, and files dispatches on demand', async () => {
    const wire = parse(WireState, (await call(API.lab.wire, { method: 'PUT', json: { everySec: 5, pushOnNew: true } })).json)
    expect(wire).toEqual({ auto: false, everySec: 5, pushOnNew: true })
    for (const json of [{ everySec: 1 }, { everySec: 3601 }, { auto: 'yes' }, { everySec: 2.5 }]) expectError(await call(API.lab.wire, { method: 'PUT', json }), 422, 'validation_failed')

    const before = parse(DispatchPage, (await call(API.dispatches)).json)
    const one = await call(API.lab.wireSpawn, { method: 'POST' })
    expect(one.res.status).toBe(201)
    expect(parse(WireSpawnResult, one.json).spawned).toHaveLength(1)
    const many = parse(WireSpawnResult, (await call(API.lab.wireSpawn, { json: { count: 4, severity: 'critical' } })).json)
    expect(many.spawned).toHaveLength(4)
    expect(many.spawned.every((s) => s.severity === 'critical')).toBe(true)
    for (const s of many.spawned) expect(await ok(API.dispatch(s.id), Dispatch)).toMatchObject({ id: s.id, severity: 'critical', title: s.title, clientId: null })
    const after = parse(DispatchPage, (await call(API.dispatches)).json)
    expect(after.total).toBe(before.total + 5)
    expect(after.feedRev).toBe(before.feedRev + 5)
    for (const json of [{ count: 0 }, { count: 11 }, { severity: 'panic' }]) expectError(await call(API.lab.wireSpawn, { json }), 422, 'validation_failed')
  })

  it('files by itself when the wire generator is on, and stops when it is off', async () => {
    await call(API.lab.wire, { method: 'PUT', json: { auto: true, everySec: 2 } })
    const total = (): Promise<number> => call(`${API.dispatches}?limit=1`).then((r) => parse(DispatchPage, r.json).total)
    const before = await total()
    await sleep(2400)
    expect(await total()).toBe(before + 1)
    await call(API.lab.wire, { method: 'PUT', json: { auto: false } })
    const stopped = await total()
    await sleep(2300)
    expect(await total()).toBe(stopped)
  })

  it('sets the header profile and rejects unknown ones', async () => {
    for (const profile of ['no-store', 'http-cache-trap', 'realistic'] as const) {
      expect(parse(HeaderProfileBody, (await call(API.lab.headers, { method: 'PUT', json: { profile } })).json)).toEqual({ profile })
      expect(parse(LabState, (await call(API.lab.state)).json).headerProfile).toBe(profile)
    }
    expectError(await call(API.lab.headers, { method: 'PUT', json: { profile: 'chaos' } }), 422, 'validation_failed')
  })

  it('answers unknown lab paths with JSON 404, never the SPA fallback or another lab route', async () => {
    for (const path of ['/api/_lab/nope', '/api/_lab/state/', '/api/_lab', '/api/_lab/']) {
      expectError(await call(path, { headers: { Accept: 'text/html' } }), 404, 'not_found')
    }
    expectError(await call(API.lab.state, { method: 'DELETE' }), 404, 'not_found')
  })

  it('resets data, chaos, wire, release, profile, log and sessions, without reusing dispatch ids', async () => {
    const cookie = await login()
    const filed = await file({}, cookie)
    await call(API.lab.chaos, { method: 'PUT', json: { serverOffline: false, schemaDrift: true, rules: [baseRule] } })
    await call(API.lab.wire, { method: 'PUT', json: { everySec: 9, pushOnNew: true } })
    await call(API.lab.release, { method: 'PUT', json: { handbookEdition: '2000.1' } })
    await call(API.lab.headers, { method: 'PUT', json: { profile: 'no-store' } })
    await call(API.lab.session, { json: { action: 'set-ttl', ttlSec: 30 } })

    const state = parse(LabState, (await call(API.lab.reset, { method: 'POST' })).json)
    expect(state).toMatchObject({ headerProfile: 'realistic', sessionTtlSec: 600, wire: { auto: false, everySec: 20, pushOnNew: false } })
    expect(state.release).toEqual({ latestClient: '1.0.0', minClient: '1.0.0', api: 1, handbookEdition: '1988.4' })
    expect(state.chaos.schemaDrift).toBe(false)
    expect(state.chaos.rules).toHaveLength(12)
    expect(state.counters).toMatchObject({ requests: 0, chaosInjected: 0, sessions: 0 })
    expect(await logEntries()).toEqual([])
    expect((await ok(API.session, SessionResponse, { cookie })).session).toBeNull()
    expectError(await call(API.dispatch(filed.id)), 404, 'not_found')
    const next = await file()
    expect(Number(next.id.slice(3))).toBeGreaterThan(Number(filed.id.slice(3)))
  })
})

// ─── request log ──────────────────────────────────────────────────────────────
describe('request log', () => {
  it('records every non-lab request with the documented fields, and never lab requests', async () => {
    const reply = await call(`${API.dispatches}?limit=2&q=a`, { headers: { 'X-Tab-Id': 'tab-xyz', 'Cache-Control': 'no-cache', 'If-Match': 'W/"x"' } })
    await call(API.lab.state)
    const entry = await logOf(reply)
    expect(entry).toMatchObject({ method: 'GET', path: `${API.dispatches}?limit=2&q=a`, status: 200, tab: 'tab-xyz', chaos: null, notes: [] })
    expect(entry.reqHeaders).toEqual({ 'cache-control': 'no-cache', 'if-match': 'W/"x"' })
    expect(entry.bytes).toBeGreaterThan(Number(reply.res.headers.get('content-length')))
    expect(entry.durationMs).toBeGreaterThanOrEqual(0)
    expect(new Date(entry.ts).toISOString()).toBe(entry.ts)
    expect((await logEntries()).some((e) => e.path.startsWith('/api/_lab'))).toBe(false)

    const fetchMeta = await raw(API.ping, { headers: { 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin', Purpose: 'prefetch', Range: 'bytes=0-9' } })
    const meta = await findLog((e) => e.requestId === fetchMeta.headers['x-request-id'])
    expect(meta).toMatchObject({ dest: 'empty', mode: 'cors', site: 'same-origin', tab: null })
    expect(meta.reqHeaders).toEqual({ purpose: 'prefetch', range: 'bytes=0-9' })
  })

  it('pages by seq, keeps seq growing across clear(), and caps the ring at 500', async () => {
    await call(API.ping)
    await call(API.ping)
    const page = parse(RequestLogPage, (await call(API.lab.log)).json)
    expect(page.entries).toHaveLength(2)
    expect(page.lastSeq).toBe(page.entries[1]?.seq)
    const since = parse(RequestLogPage, (await call(`${API.lab.log}?since=${page.entries[0]?.seq}`)).json)
    expect(since.entries.map((e) => e.seq)).toEqual([page.entries[1]?.seq])
    expect(parse(RequestLogPage, (await call(`${API.lab.log}?since=${page.lastSeq}`)).json).entries).toEqual([])
    expectError(await call(`${API.lab.log}?since=-1`), 422, 'validation_failed')

    const cleared = parse(RequestLogPage, (await call(API.lab.log, { method: 'DELETE' })).json)
    expect(cleared).toEqual({ entries: [], lastSeq: page.lastSeq })
    await call(API.ping)
    const next = parse(RequestLogPage, (await call(API.lab.log)).json)
    expect(next.entries[0]?.seq).toBe(page.lastSeq + 1)

    for (let batch = 0; batch < 11; batch++) await Promise.all(Array.from({ length: 50 }, () => call(API.ping)))
    const full = parse(RequestLogPage, (await call(API.lab.log)).json)
    expect(full.entries).toHaveLength(500)
    expect(full.entries.map((e) => e.seq)).toEqual([...full.entries.map((e) => e.seq)].sort((a, b) => a - b))
    expect(full.lastSeq).toBeGreaterThanOrEqual(page.lastSeq + 551)
  })
})

// ─── chaos ────────────────────────────────────────────────────────────────────
describe('chaos modes', () => {
  const target = API.bench('cache-first', 'alpha')

  it('pass: latency only, labelled, and counted', async () => {
    await setChaos({ latencyMs: 200, jitterMs: 50 })
    const started = Date.now()
    const reply = await call(target)
    expect(Date.now() - started).toBeGreaterThanOrEqual(190)
    parse(BenchResponse, reply.json)
    expect(reply.res.headers.get('x-chaos')).toBe('test rule')
    expect((await logOf(reply)).chaos).toBe('test rule')
    expect(parse(LabState, (await call(API.lab.state)).json).counters.chaosInjected).toBe(1)
  })

  it('leaves no trace when a rule neither delays nor fires, or is disabled, or does not match', async () => {
    for (const rule of [{ probability: 0 }, { enabled: false, mode: 'status' as const }, { mode: 'status' as const, pathPrefix: '/api/bench/cache-only' }]) {
      await setChaos(rule)
      const reply = await call(target)
      expect(reply.res.status).toBe(200)
      expect(reply.res.headers.has('x-chaos')).toBe(false)
    }
    await setChaos({ probability: 0, latencyMs: 100, mode: 'status' })
    const slow = await call(target)
    expect(slow.res.status).toBe(200)
    expect(slow.res.headers.get('x-chaos')).toBe('test rule')
  })

  it('status: an ApiErrorBody with the rule status and a matching code', async () => {
    const codes: [number, string][] = [[400, 'bad_request'], [401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [409, 'conflict'], [410, 'gone'], [422, 'validation_failed'], [429, 'rate_limited'], [500, 'internal'], [502, 'unavailable'], [503, 'unavailable'], [504, 'unavailable']]
    for (const [status, code] of codes) {
      await setChaos({ mode: 'status', status })
      const reply = await call(target)
      expectError(reply, status, code)
      expect(reply.res.headers.get('x-chaos')).toBe('test rule')
      expect(reply.res.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('drop: the connection dies and fetch rejects with a TypeError; the log says status 0', async () => {
    await setChaos({ mode: 'drop' })
    const result = await outcome(target)
    expect(result.kind).toBe('fetch-rejected')
    expect(result.kind === 'fetch-rejected' && result.error).toBeInstanceOf(TypeError)
    const entry = await findLog((e) => e.path === target)
    expect(entry).toMatchObject({ status: 0, chaos: 'test rule' })
  })

  it('hang: no answer until the client gives up, and the abort is logged as status 0', async () => {
    await setChaos({ mode: 'hang' })
    const result = await outcome(target, { signal: AbortSignal.timeout(300) })
    expect(result.kind).toBe('fetch-rejected')
    expect(result.kind === 'fetch-rejected' && (result.error as Error).name).toBe('TimeoutError')
    expect(await findLog((e) => e.path === target)).toMatchObject({ status: 0, chaos: 'test rule' })
    await setChaos(null)
    expect((await call(API.ping)).res.status).toBe(204)
  })

  it('html-200: a captive-portal page where JSON was expected', async () => {
    await setChaos({ mode: 'html-200' })
    const reply = await call(target)
    expect(reply.res.status).toBe(200)
    expect(reply.res.headers.get('content-type')).toContain('text/html')
    expect(reply.text).toContain('<form')
    expect(reply.json).toBeUndefined()
  })

  it('empty-200: success with zero bytes', async () => {
    await setChaos({ mode: 'empty-200' })
    const reply = await call(target)
    expect(reply.res.status).toBe(200)
    expect(reply.res.headers.get('content-type')).toContain('application/json')
    expect(reply.text).toBe('')
  })

  it('corrupt-json: declared JSON that does not parse', async () => {
    await setChaos({ mode: 'corrupt-json' })
    const reply = await call(target)
    expect(reply.res.status).toBe(200)
    expect(reply.res.headers.get('content-type')).toContain('application/json')
    expect(reply.text.length).toBeGreaterThan(20)
    expect(() => JSON.parse(reply.text)).toThrow(SyntaxError)
  })

  it('truncate-json: headers arrive, the body read fails', async () => {
    await setChaos({ mode: 'truncate-json' })
    const result = await outcome(target)
    expect(result.kind).toBe('body-rejected')
    if (result.kind === 'body-rejected') {
      expect(result.reply.status).toBe(200)
      expect(result.error).toBeInstanceOf(TypeError)
    }
    expect(await findLog((e) => e.path === target)).toMatchObject({ status: 0 })
  })

  it('slow-body: the real body, dribbled out in several chunks', async () => {
    await setChaos({ mode: 'slow-body', pathPrefix: API.version })
    const started = Date.now()
    const res = await fetch(base + API.version)
    const reader = res.body?.getReader()
    if (!reader) throw new Error('no body')
    const chunks: Uint8Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    expect(res.headers.get('x-chaos')).toBe('test rule')
    expect(chunks.length).toBeGreaterThan(3)
    expect(Date.now() - started).toBeGreaterThan(1000)
    parse(VersionInfo, JSON.parse(Buffer.concat(chunks).toString('utf8')))
  })

  it('slow-body: bodyless and HEAD responses are not held back', async () => {
    await setChaos({ mode: 'slow-body', pathPrefix: '/api' })
    const started = Date.now()
    expect((await call(API.ping)).res.status).toBe(204)
    expect((await call(API.version, { method: 'HEAD' })).res.status).toBe(200)
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('rate-limit: 429 with Retry-After and the same number in the body', async () => {
    await setChaos({ mode: 'rate-limit', retryAfterSec: 7 })
    const reply = await call(target)
    const error = expectError(reply, 429, 'rate_limited')
    expect(reply.res.headers.get('retry-after')).toBe('7')
    expect(error.details).toEqual({ retryAfterSec: 7 })
  })

  it('serverOffline: every non-lab request loses its socket, the lab keeps answering', async () => {
    await setChaos(null, { serverOffline: true })
    for (const path of [API.ping, API.dispatches, '/media/dispatch/dp-000001.svg', '/']) expect((await outcome(path)).kind, path).toBe('fetch-rejected')
    expect((await outcome(API.ping, { method: 'HEAD' })).kind).toBe('fetch-rejected')
    const state = await call(API.lab.state)
    expect(state.res.status).toBe(200)
    expect(state.res.headers.has('x-chaos')).toBe(false)
    expect(await findLog((e) => e.path === API.dispatches)).toMatchObject({ status: 0, chaos: 'server-offline' })
    await setChaos(null)
    expect((await call(API.ping)).res.status).toBe(204)
  })

  it('never touches /api/_lab, whatever the rules and switches say', async () => {
    for (const pathPrefix of ['', '/', '/api', '/api/_lab', '/api/_lab/state']) {
      await setChaos({ mode: 'drop', pathPrefix }, { serverOffline: true })
      for (const path of [API.lab.state, API.lab.truth, API.lab.chaos, API.lab.log]) {
        const reply = await call(path)
        expect(reply.res.status, `${pathPrefix} ${path}`).toBe(200)
        expect(reply.res.headers.has('x-chaos')).toBe(false)
      }
    }
    await setChaos({ mode: 'status', pathPrefix: '' })
    expect((await call(API.ping)).res.status).toBe(500)
    expect((await call(API.lab.state)).res.status).toBe(200)
  })

  it('matches on method, and lets a HEAD probe feel a GET rule', async () => {
    await setChaos({ mode: 'status', method: 'POST' })
    expect((await call(target)).res.status).toBe(200)
    expectError(await call(API.benchBump('cache-first', 'alpha'), { method: 'POST' }), 500, 'internal')
    await setChaos({ mode: 'status', method: 'GET', pathPrefix: API.ping })
    expect((await call(API.ping, { method: 'HEAD' })).res.status).toBe(500)
    expect((await call(API.ping)).res.status).toBe(500)
    expect((await call(API.bench('cache-first', 'alpha'), { method: 'POST' })).res.status).toBe(404)
  })

  it('applies the first enabled matching rule only', async () => {
    const rules = [
      { ...baseRule, id: 'off', enabled: false, mode: 'status', status: 503 },
      { ...baseRule, id: 'first', label: 'first', mode: 'status', status: 418 },
      { ...baseRule, id: 'second', label: 'second', mode: 'status', status: 503 },
    ]
    await call(API.lab.chaos, { method: 'PUT', json: { serverOffline: false, schemaDrift: false, rules } })
    const reply = await call(target)
    expect(reply.res.status).toBe(418)
    expect(reply.res.headers.get('x-chaos')).toBe('first')
  })

  it('keeps hostile rule labels out of the header block', async () => {
    await setChaos({ label: 'x\r\nSet-Cookie: pwn=1ü☃', mode: 'status' })
    const reply = await call(target)
    expect(reply.res.headers.get('x-chaos')).toBe('x??Set-Cookie: pwn=1??')
    expect(reply.res.headers.getSetCookie()).toEqual([])
    expect((await logOf(reply)).chaos).toBe('x??Set-Cookie: pwn=1??')
  })

  it('schema drift: dispatch shapes change, the envelope and everything else stay', async () => {
    const before = await call(`${API.dispatches}?limit=5`)
    const etag = before.res.headers.get('etag') ?? ''
    const pageBefore = parse(DispatchPage, before.json)
    const cookie = await login()

    await setChaos(null, { schemaDrift: true })
    const reply = await call(`${API.dispatches}?limit=5`, { headers: { 'If-None-Match': etag } })
    expect(reply.res.status).toBe(200)
    const drifted = reply.json as { items: unknown[]; nextCursor: unknown; total: unknown; feedRev: unknown }
    expect(Object.keys(drifted).sort()).toEqual(['feedRev', 'items', 'nextCursor', 'total'])
    expect(drifted.total).toBe(pageBefore.total)
    expect(DispatchPage.safeParse(reply.json).success).toBe(false)
    expect(drifted.items).toHaveLength(5)
    drifted.items.forEach((item, i) => {
      expect(Dispatch.safeParse(item).success).toBe(false)
      const parsed = parse(DriftedDispatch, item)
      const original = pageBefore.items[i]
      expect(parsed).toMatchObject({ id: original?.id, station_id: original?.stationId, title: original?.title, filed_at: original?.filedAt })
      expect(parsed.level).toBe(['routine', 'notice', 'urgent', 'critical'].indexOf(original?.severity ?? '') + 1)
    })

    // One dispatch: same revision, different shape, so the validator differs and a pre-drift ETag cannot win a 304.
    const detail = await call(API.dispatch('dp-000064'), { headers: { 'If-None-Match': 'W/"dp-000064-r1"' } })
    expect(detail.res.status).toBe(200)
    expect(DriftedDispatch.safeParse(detail.json).success).toBe(true)
    expect(detail.res.headers.get('etag')).toBe('W/"dp-000064-r1-drift"')
    expect(detail.res.headers.get('x-resource-rev')).toBe('1')
    expect((await call(API.dispatch('dp-000064'), { headers: { 'If-None-Match': 'W/"dp-000064-r1-drift"' } })).res.status).toBe(304)
    // If-Match names a revision: the tag a client cached before the switch still identifies it.
    const patched = await call(API.dispatch('dp-000064'), { method: 'PATCH', json: { starred: true }, headers: { 'If-Match': 'W/"dp-000064-r1"' } })
    expect(patched.res.status).toBe(200)
    expect(patched.res.headers.get('etag')).toBe('W/"dp-000064-r2-drift"')
    const stale = await call(API.dispatch('dp-000064'), { method: 'PATCH', json: { read: true }, headers: { 'If-Match': 'W/"dp-000064-r1"' } })
    expect(expectError(stale, 412, 'conflict').details).toBeDefined()
    expect(stale.res.headers.get('etag')).toBe('W/"dp-000064-r2-drift"')
    const created = await call(API.dispatches, { json: draft(), cookie })
    expect(created.res.status).toBe(201)
    expect(DriftedDispatch.safeParse(created.json).success).toBe(true)
    const digest = (await call(API.digest)).json as { items: unknown[] }
    expect(digest.items.length).toBeGreaterThan(0)
    for (const item of digest.items) expect(DriftedDispatch.safeParse(item).success).toBe(true)
    expect(Digest.safeParse(digest).success).toBe(false)

    parse(StationList, (await call(API.stations)).json)
    parse(InboxSummary, (await call(API.inbox)).json)
    parse(SignalBoard, (await call(API.signal)).json)

    await setChaos(null, { schemaDrift: false })
    expect(parse(DispatchPage, (await call(`${API.dispatches}?limit=5`)).json).items).toHaveLength(5)
    expect((await call(`${API.dispatches}?limit=5`, { headers: { 'If-None-Match': reply.res.headers.get('etag') ?? '' } })).res.status).toBe(200)
  })
})

// ─── header profiles ──────────────────────────────────────────────────────────
describe('header profiles', () => {
  const cache = async (path: string, opts: CallOptions = {}): Promise<string | null> => (await call(path, opts)).res.headers.get('cache-control')
  const html = { headers: { Accept: 'text/html' } }

  it('API: no-cache with validators, no-store, or max-age=60', async () => {
    const api = [API.dispatches, API.dispatch('dp-000064'), API.stations, API.station('KRN-07'), API.inbox, API.digest, API.handbook, API.version, API.lab.state]
    for (const [profile, expected] of [['realistic', 'no-cache'], ['no-store', 'no-store'], ['http-cache-trap', 'max-age=60']] as const) {
      await setProfile(profile)
      for (const path of api) {
        const want = path === API.lab.state ? 'no-store' : expected
        expect(await cache(path), `${profile} ${path}`).toBe(want)
      }
    }
    await setProfile('realistic')
    expect((await call(API.dispatches)).res.headers.get('etag')).toBeTruthy()
  })

  it('always no-store: ping, session, signal, lab, network-only bench, and every error response', async () => {
    for (const profile of ['realistic', 'no-store', 'http-cache-trap'] as const) {
      await setProfile(profile)
      for (const path of [API.ping, API.session, API.signal, API.lab.state, API.lab.truth, API.lab.log, API.bench('network-only', 'alpha'), API.bench('network-only', 'delta'), '/api/nope', API.dispatch('dp-999999'), '/missing.js']) {
        expect(await cache(path), `${profile} ${path}`).toBe('no-store')
      }
      expect(await cache(API.session, { method: 'DELETE' })).toBe('no-store')
      expect(await cache(API.session, { json: { callsign: 'CACHE-1' } })).toBe('no-store')
    }
  })

  it('bench: the other four strategies follow the profile', async () => {
    for (const [profile, expected] of [['realistic', 'no-cache'], ['no-store', 'no-store'], ['http-cache-trap', 'max-age=60']] as const) {
      await setProfile(profile)
      for (const strategy of ['cache-first', 'network-first', 'stale-while-revalidate', 'cache-only'] as const) expect(await cache(API.bench(strategy, 'beta')), `${profile} ${strategy}`).toBe(expected)
    }
  })

  it('media: a day under realistic and trap, no-store under no-store', async () => {
    for (const [profile, expected] of [['realistic', 'public, max-age=86400'], ['http-cache-trap', 'public, max-age=86400'], ['no-store', 'no-store']] as const) {
      await setProfile(profile)
      expect(await cache('/media/dispatch/dp-000001.svg'), profile).toBe(expected)
      expect(await cache('/media/station/KRN-07.svg'), profile).toBe(expected)
    }
  })

  it('static: entry points, assets and version.json per profile', async () => {
    const entries = ['/', '/index.html', '/log/dp-000001', '/sw.js', '/manifest.webmanifest']
    const get = (path: string): Promise<string | null> => cache(path, html)
    const table: [HeaderProfile, string, string][] = [
      ['realistic', 'entry', 'no-cache'],
      ['no-store', 'entry', 'no-store'],
      ['http-cache-trap', 'entry', 'max-age=31536000'],
    ]
    for (const [profile, , expected] of table) {
      await setProfile(profile)
      for (const path of entries) expect(await get(path), `${profile} ${path}`).toBe(expected)
      expect(await get('/assets/app-abc123.js'), profile).toBe(profile === 'no-store' ? 'no-store' : 'public, max-age=31536000, immutable')
      expect(await get('/version.json'), profile).toBe(profile === 'no-store' ? 'no-store' : 'no-cache')
      expect(await get('/icons/icon-192.png'), profile).toBe(profile === 'no-store' ? 'no-store' : 'no-cache')
    }
  })

  it('serves static files with the right MIME type, length and validators', async () => {
    const types: Record<string, string> = {
      '/': 'text/html; charset=utf-8',
      '/index.html': 'text/html; charset=utf-8',
      '/sw.js': 'text/javascript; charset=utf-8',
      '/manifest.webmanifest': 'application/manifest+json; charset=utf-8',
      '/version.json': 'application/json; charset=utf-8',
      '/favicon.svg': 'image/svg+xml; charset=utf-8',
      '/assets/app-abc123.js': 'text/javascript; charset=utf-8',
      '/assets/app-abc123.js.map': 'application/json; charset=utf-8',
      '/assets/app-abc123.css': 'text/css; charset=utf-8',
      '/assets/font-abc123.woff2': 'font/woff2',
      '/icons/icon-192.png': 'image/png',
      '/.well-known/assetlinks.json': 'application/json; charset=utf-8',
    }
    for (const [path, type] of Object.entries(types)) {
      const reply = await call(path)
      expect(reply.res.status, path).toBe(200)
      expect(reply.res.headers.get('content-type'), path).toBe(type)
      expect(reply.res.headers.get('x-content-type-options'), path).toBe('nosniff')
      expect(Number(reply.res.headers.get('content-length')), path).toBe(Buffer.byteLength(reply.text))
      expect(reply.res.headers.get('etag'), path).toMatch(/^W\//)
    }
    const head = await call('/sw.js', { method: 'HEAD' })
    expect(head.res.status).toBe(200)
    expect(head.text).toBe('')
    expect(Number(head.res.headers.get('content-length'))).toBeGreaterThan(0)
    expect(head.res.headers.has('service-worker-allowed')).toBe(false)
  })

  it('revalidates static files by ETag and by date, ETag first, and notes it in the log', async () => {
    const first = await call('/assets/app-abc123.js')
    const etag = first.res.headers.get('etag') ?? ''
    const modified = first.res.headers.get('last-modified') ?? ''
    expect(modified).toMatch(/GMT$/)

    const byTag = await call('/assets/app-abc123.js', { headers: { 'If-None-Match': etag, 'Cache-Control': 'no-cache' } })
    expect(byTag.res.status).toBe(304)
    expect(byTag.text).toBe('')
    expect((await logOf(byTag)).notes).toContain('etag-304')
    const byDate = await call('/assets/app-abc123.js', { headers: { 'If-Modified-Since': modified } })
    expect(byDate.res.status).toBe(304)
    expect((await call('/assets/app-abc123.js', { headers: { 'If-Modified-Since': new Date(Date.parse(modified) - 5000).toUTCString() } })).res.status).toBe(200)
    expect((await call('/assets/app-abc123.js', { headers: { 'If-None-Match': 'W/"other"', 'If-Modified-Since': modified } })).res.status).toBe(200)

    const path = join(sandbox, 'dist', 'assets', 'app-abc123.js')
    writeFileSync(path, 'export const x = 2222\n')
    utimesSync(path, new Date(Date.now() + 10_000), new Date(Date.now() + 10_000))
    expect((await call('/assets/app-abc123.js', { headers: { 'If-None-Match': etag } })).res.status).toBe(200)
  })
})

// ─── routing rules, SPA fallback, static safety ───────────────────────────────
describe('routing', () => {
  const html = { headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' } }

  it('falls back to index.html only for GET/HEAD with Accept text/html, no extension, outside /api and /media', async () => {
    for (const path of ['/log', '/log/dp-000001', '/lab/chaos', '/share-target?title=x', '/stations/KRN-07', '/offline']) {
      const reply = await call(path, html)
      expect(reply.res.status, path).toBe(200)
      expect(reply.res.headers.get('content-type')).toContain('text/html')
      expect(reply.text).toContain('<div id="root">')
    }
    expect((await call('/log', { ...html, method: 'HEAD' })).res.status).toBe(200)

    for (const [path, opts] of [
      ['/log/dp-000001', { headers: { Accept: 'application/json' } }],
      ['/log/dp-000001', {}],
      ['/log/dp-000001', { method: 'POST', body: '{}' }],
      ['/log/dp-000001', { method: 'DELETE' }],
      ['/some/page.with.dot', html],
      ['/missing.js', html],
      ['/missing.png', html],
    ] as [string, CallOptions][]) {
      const reply = await call(path, opts)
      expect(reply.res.status, `${opts.method ?? 'GET'} ${path}`).toBe(404)
      expect(reply.res.headers.get('content-type')).toContain('text/plain')
      expect(reply.text).not.toContain('<div id="root">')
    }
  })

  it('answers missing files under /assets/ with a plain 404, even for a browser navigation', async () => {
    for (const path of ['/assets/app-deadbeef.js', '/assets/app-deadbeef.css', '/assets/no-extension', '/assets/', '/assets/sub/dir/file.js']) {
      const reply = await call(path, html)
      expect(reply.res.status, path).toBe(404)
      expect(reply.res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
      expect(reply.res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(reply.text).not.toContain('<html')
    }
    await setChaos({ pathPrefix: '/assets/', mode: 'status', status: 404 })
    const stale = await call('/assets/app-abc123.js')
    expectError(stale, 404, 'not_found')
    expect(stale.res.headers.get('x-chaos')).toBe('test rule')
  })

  it('answers unknown /api paths and methods with JSON 404, for browsers too', async () => {
    const cases: [string, CallOptions][] = [
      ['/api/nope', {}],
      ['/api', {}],
      ['/api/', {}],
      ['/api/dispatches/', {}],
      ['/api/ping/', {}],
      ['/api/ping', { method: 'POST' }],
      ['/api/dispatches', { method: 'PUT', json: {} }],
      ['/api/stations', { method: 'DELETE' }],
      ['/api/session/extra', {}],
    ]
    for (const [path, opts] of cases) {
      const reply = await call(path, { ...opts, headers: { Accept: 'text/html', ...opts.headers } })
      expectError(reply, 404, 'not_found')
    }
  })

  it('matches routes exactly, so cache policy and chaos cannot be dodged by case or a trailing slash', async () => {
    await setProfile('http-cache-trap')
    await setChaos({ mode: 'status', pathPrefix: '/api' })
    for (const path of ['/API/dispatches', '/Api/dispatches', '/API/PING']) {
      const reply = await call(path)
      expect(reply.res.status, path).toBe(404)
      expect(reply.res.headers.get('content-type'), path).toContain('text/plain')
      expect(reply.res.headers.get('cache-control'), path).toBe('no-store')
    }
    const exact = await call(API.dispatches)
    expect(exact.res.status).toBe(500)
    expect(exact.res.headers.get('x-chaos')).toBe('test rule')
    expect((await call('/API/_LAB/state')).res.status).toBe(404)
    expect((await call('/API/_LAB/headers', { method: 'PUT', json: { profile: 'realistic' } })).res.status).toBe(404)
    expect(parse(LabState, (await call(API.lab.state)).json).headerProfile).toBe('http-cache-trap')
  })

  it('answers unknown /media paths with plain 404 and a missing entity with JSON 404', async () => {
    for (const path of ['/media/dispatch/dp-000001', '/media/nope.svg', '/media/', '/media/dispatch/dp-000001.png']) {
      const reply = await call(path, html)
      expect(reply.res.status, path).toBe(404)
      expect(reply.res.headers.get('content-type'), path).toContain('text/plain')
    }
    expectError(await call('/media/dispatch/dp-999999.svg'), 404, 'not_found')
    expectError(await call('/media/station/NOPE-99.svg'), 404, 'not_found')
  })

  it('hints at the build when there is no index.html to fall back to', async () => {
    const index = join(sandbox, 'dist', 'index.html')
    renameSync(index, `${index}.bak`)
    try {
      const reply = await call('/log', html)
      expect(reply.res.status).toBe(404)
      expect(reply.res.headers.get('content-type')).toContain('text/plain')
      expect(reply.text).toContain('npm run build')
      expect(reply.res.headers.get('cache-control')).toBe('no-store')
      expect((await call(API.ping)).res.status).toBe(204)
    } finally {
      renameSync(`${index}.bak`, index)
    }
  })

  it('never serves a file from outside dist/, or a dotfile, however the path is spelled', async () => {
    const paths = [
      '/../secret.txt',
      '/../../secret.txt',
      '/%2e%2e/secret.txt',
      '/%2E%2E/secret.txt',
      '/%2e%2e%2fsecret.txt',
      '/..%2fsecret.txt',
      '/..%2Fsecret.txt',
      '/assets/..%2f..%2fsecret.txt',
      '/assets/%2e%2e/%2e%2e/secret.txt',
      '/assets/../../secret.txt',
      '/%252e%252e/secret.txt',
      '/..%5csecret.txt',
      '/..\\secret.txt',
      '/assets/..\\..\\secret.txt',
      '/....//secret.txt',
      '/.well-known/../../secret.txt',
      '/.well-known/%2e%2e/%2e%2e/secret.txt',
      '/.well-known/../.env',
      '/%2e%2e/dist/.env',
      '//secret.txt',
      '/%00',
      '/secret.txt%00.js',
      '/index.html%00.png',
      '/.env',
      '/%2eenv',
      '/assets/.env',
      '/.git/config',
      '/.well-known/.env',
      '/.%2e/secret.txt',
      '/media/../../secret.txt',
      '/api/../../secret.txt',
      '/%c0%ae%c0%ae/secret.txt',
      '/%ff',
    ]
    for (const path of paths) {
      const reply = await raw(path)
      expect(reply.body, path).not.toContain('SECRET')
      // No Accept: text/html, so nothing may fall back to the SPA either: every odd path is a plain refusal.
      expect([400, 404], path).toContain(reply.status)
    }
    expect((await raw('/.well-known/assetlinks.json')).status).toBe(200)
    expect((await raw('/.well-known/../.env')).status).toBe(404)
    expect((await raw('/../secret.txt')).status).toBe(404)
  })

  it('serves generated media with a delay, validators and the right type', async () => {
    const started = Date.now()
    const reply = await call('/media/dispatch/dp-000001.svg')
    expect(Date.now() - started).toBeGreaterThanOrEqual(35)
    expect(reply.res.status).toBe(200)
    expect(reply.res.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8')
    expect(reply.text.startsWith('<svg')).toBe(true)
    expect(reply.text.length).toBeGreaterThan(1500)
    expect(reply.text.length).toBeLessThan(12_000)
    expect(Number(reply.res.headers.get('content-length'))).toBe(Buffer.byteLength(reply.text))
    const etag = reply.res.headers.get('etag') ?? ''
    const again = await call('/media/dispatch/dp-000001.svg', { headers: { 'If-None-Match': etag } })
    expect(again.res.status).toBe(304)
    expect((await logOf(again)).notes).toContain('etag-304')
    expect((await call('/media/dispatch/dp-000002.svg')).text).not.toBe(reply.text)
    expect((await call('/media/dispatch/dp-000001.svg')).text).toBe(reply.text)
    for (const code of ['KRN-07', 'krn-07']) expect((await call(`/media/station/${code}.svg`)).res.status).toBe(200)
  })
})

// ─── cross-origin writes ──────────────────────────────────────────────────────
describe('same-origin writes', () => {
  it('refuses unsafe requests from another origin, including the lab, and lets same-origin and originless ones through', async () => {
    const sameOrigin = { Origin: base, 'Content-Type': 'application/json' }
    for (const origin of ['http://evil.example', 'null', 'http://127.0.0.1:1', 'not a url', `${base}.evil.example`]) {
      for (const [method, path] of [['POST', API.lab.reset], ['PUT', API.lab.headers], ['POST', API.inboxReadAll], ['POST', API.session], ['PATCH', API.dispatch('dp-000064')], ['DELETE', API.session]] as const) {
        const reply = await raw(path, { method, headers: { Origin: origin, 'Content-Type': 'application/json' } })
        expect(reply.status, `${method} ${path} from ${origin}`).toBe(403)
        expect(JSON.parse(reply.body)).toMatchObject({ error: { code: 'forbidden' } })
      }
    }
    expect((await raw(API.lab.reset, { method: 'POST', headers: sameOrigin })).status).toBe(200)
    expect((await raw(API.inboxReadAll, { method: 'POST', headers: sameOrigin })).status).toBe(200)
    expect((await call(API.inboxReadAll, { method: 'POST' })).res.status).toBe(200)
    // Reads are never blocked; without CORS headers the other origin cannot read the answer anyway.
    expect((await raw(API.dispatches, { headers: { Origin: 'http://evil.example' } })).status).toBe(200)
    expect(parse(LabState, (await call(API.lab.state)).json).headerProfile).toBe('realistic')
  })
})

// ─── bounded state ────────────────────────────────────────────────────────────
describe('bounded state', () => {
  it('evicts the oldest dispatches beyond 1000 and keeps the newest, including one filed in the past', async () => {
    const seeded = (await walk('', 50)).map((d) => d.id)
    for (let i = 0; i < 100; i++) await call(API.lab.wireSpawn, { json: { count: 10 } })
    const total = parse(DispatchPage, (await call(`${API.dispatches}?limit=1`)).json).total
    expect(total).toBe(1000)
    expect(parse(LabState, (await call(API.lab.state)).json).counters.dispatches).toBe(1000)
    expectError(await call(API.dispatch(seeded.at(-1) ?? '')), 404, 'not_found')
    const newest = (await walk('', 50))[0]
    // Ids are never reused across resets, so only a lower bound is known.
    expect(Number(newest?.id.slice(3))).toBeGreaterThanOrEqual(1064)

    const cookie = await login()
    const old = await file({ filedAtClient: new Date(Date.now() - 86_400_000 * 400).toISOString() }, cookie)
    expect((await call(API.dispatch(old.id))).res.status).toBe(200)
    expect(parse(DispatchPage, (await call(`${API.dispatches}?limit=1`)).json).total).toBe(1000)
  })

  it('keeps at most 500 live sessions, dropping the oldest first', async () => {
    const cookies: string[] = []
    for (let i = 0; i < 510; i++) cookies.push(await login(`BULK-${i}`))
    expect(parse(LabState, (await call(API.lab.state)).json).counters.sessions).toBe(500)
    expect((await ok(API.session, SessionResponse, { cookie: cookies[0] })).session).toBeNull()
    expect((await ok(API.session, SessionResponse, { cookie: cookies[509] })).session?.operator.callsign).toBe('BULK-509')
  })
})

// ─── push ─────────────────────────────────────────────────────────────────────
describe('push', () => {
  const subscribe = async (endpoint = deadEndpoint(), label?: string): Promise<Reply> => call(API.pushSubscribe, { json: { subscription: { endpoint, expirationTime: null, keys: pushKeys() }, label } })
  const send = (json: Record<string, unknown>): Promise<Reply> => call(API.pushSend, { json })

  it('serves a stable VAPID public key', async () => {
    const key = parse(PushVapid, (await call(API.pushVapid)).json).publicKey
    expect(key).toMatch(/^[\w-]{80,100}$/)
    expect(parse(PushVapid, (await call(API.pushVapid)).json).publicKey).toBe(key)
  })

  it('subscribes idempotently, lists, persists, and unsubscribes by endpoint or id', async () => {
    expect(parse(PushSubscriptionList, (await call(API.pushSubscriptions)).json).items).toEqual([])
    const endpoint = deadEndpoint('tail-0000001')
    const created = await subscribe(endpoint, 'Desk phone')
    expect(created.res.status).toBe(201)
    const info = parse(PushSubscriptionInfo, created.json)
    expect(info).toMatchObject({ endpointHost: '127.0.0.1:9', endpointTail: 'tail-0000001', label: 'Desk phone', lastResult: 'never' })
    expect(info.id).toMatch(/^ps-[0-9a-f]{10}$/)

    const again = await subscribe(endpoint)
    expect(again.res.status).toBe(200)
    expect(parse(PushSubscriptionInfo, again.json)).toMatchObject({ id: info.id, label: 'Desk phone', createdAt: info.createdAt })
    expect(parse(PushSubscriptionList, (await call(API.pushSubscriptions)).json).items).toHaveLength(1)
    expect(parse(LabState, (await call(API.lab.state)).json).counters.subscriptions).toBe(1)

    const stored = JSON.parse(readFileSync(join(sandbox, 'data', 'subscriptions.json'), 'utf8')) as { endpoint: string }[]
    expect(stored.map((s) => s.endpoint)).toEqual([endpoint])
    expect(readFileSync(join(sandbox, 'data', 'vapid.json'), 'utf8')).toContain('privateKey')

    expect((await call(API.pushUnsubscribe, { json: { endpoint } })).json).toEqual({ removed: true })
    expect((await call(API.pushUnsubscribe, { json: { endpoint } })).json).toEqual({ removed: false })
    const second = parse(PushSubscriptionInfo, (await subscribe(deadEndpoint('tail-0000002'))).json)
    expect((await call(API.pushUnsubscribe, { json: { id: second.id } })).json).toEqual({ removed: true })
    expect(parse(PushSubscriptionList, (await call(API.pushSubscriptions)).json).items).toEqual([])
  })

  it('rejects malformed subscriptions, non-https endpoints and empty unsubscribe bodies', async () => {
    const keys = pushKeys()
    const bad: unknown[] = [
      { subscription: { endpoint: 'http://push.example/abc', keys } },
      { subscription: { endpoint: 'not a url', keys } },
      { subscription: { endpoint: deadEndpoint(), keys: { p256dh: 'x' } } },
      { subscription: { endpoint: deadEndpoint() }, label: 'x' },
      { subscription: { endpoint: deadEndpoint(), keys }, label: 'x'.repeat(61) },
      {},
    ]
    for (const json of bad) expectError(await call(API.pushSubscribe, { json }), 422, 'validation_failed')
    expectError(await call(API.pushUnsubscribe, { json: {} }), 422, 'validation_failed')
    expect(parse(PushSubscriptionList, (await call(API.pushSubscriptions)).json).items).toEqual([])
  })

  it('builds the documented payload for each kind, with nothing to send to', async () => {
    const unread = parse(InboxSummary, (await call(API.inbox)).json).unread
    const critical = (await walk('severity=critical', 50))[0]
    if (!critical) throw new Error('no critical dispatch in the seed')

    const custom = parse(PushSendResult, (await send({ title: 'Mast check', body: 'Two lines down.' })).json)
    expect(custom).toMatchObject({ attempted: 0, delivered: 0, failed: 0, pruned: 0, scheduledInSec: 0, results: [] })
    expect(custom.payload).toMatchObject({ v: 1, kind: 'custom', title: 'Mast check', body: 'Two lines down.', url: '/log', tag: null, dispatchId: null, badgeCount: unread, silent: false, actions: [], requireInteraction: false })
    expect(new Date(custom.payload.sentAt).toISOString()).toBe(custom.payload.sentAt)

    const dispatch = parse(PushSendResult, (await send({ kind: 'dispatch', dispatchId: critical.id })).json).payload
    expect(dispatch).toMatchObject({ kind: 'dispatch', dispatchId: critical.id, url: `/log/${critical.id}`, tag: `dispatch-${critical.id}`, requireInteraction: true, silent: false })
    expect(dispatch.title).toContain(critical.title)
    expect(dispatch.actions.map((a) => a.action)).toEqual(['open', 'ack'])
    const routine = (await walk('severity=routine', 50))[0]
    expect(parse(PushSendResult, (await send({ kind: 'dispatch', dispatchId: routine?.id })).json).payload.requireInteraction).toBe(false)

    for (const kind of ['silent-badge', 'sync-poke']) expect(parse(PushSendResult, (await send({ kind })).json).payload).toMatchObject({ kind, silent: true, actions: [], badgeCount: unread })
    expect(parse(PushSendResult, (await send({ title: 't', badgeCount: 7 })).json).payload.badgeCount).toBe(7)
    expect(parse(PushSendResult, (await send({ title: 't', badgeCount: null })).json).payload.badgeCount).toBeNull()
    expect(parse(PushSendResult, (await send({ title: 't', url: '/inbox', tag: 'x', requireInteraction: true, actions: [{ action: 'a', title: 'A' }] })).json).payload).toMatchObject({ url: '/inbox', tag: 'x', requireInteraction: true, actions: [{ action: 'a', title: 'A' }] })
  })

  it('rejects impossible send requests', async () => {
    for (const json of [{}, { kind: 'custom', title: '  ' }, { kind: 'dispatch' }, { title: 't', ttl: 86_401 }, { title: 't', urgency: 'shouty' }, { title: 't', delaySec: 301 }, { title: 't', badgeCount: -1 }, { title: 't', actions: [{ action: 'a', title: 'A' }, { action: 'b', title: 'B' }, { action: 'c', title: 'C' }] }, { kind: 'telegram' }]) {
      expectError(await send(json), 422, 'validation_failed')
    }
    expectError(await send({ kind: 'dispatch', dispatchId: 'dp-999999' }), 404, 'not_found')
  })

  it('records a failed delivery without crashing, for unreachable endpoints and unusable keys', async () => {
    const good = parse(PushSubscriptionInfo, (await subscribe(deadEndpoint('tail-good-01'))).json)
    const broken = parse(PushSubscriptionInfo, (await call(API.pushSubscribe, { json: { subscription: { endpoint: deadEndpoint('tail-bad-001'), keys: { p256dh: 'AAAA', auth: 'AAAA' } } } })).json)
    const result = parse(PushSendResult, (await send({ title: 'Ping', ttl: 60, urgency: 'low' })).json)
    expect(result).toMatchObject({ attempted: 2, delivered: 0, failed: 2, pruned: 0 })
    expect(result.results.map((r) => r.id).sort()).toEqual([good.id, broken.id].sort())
    for (const r of result.results) {
      expect(r.ok).toBe(false)
      expect(r.error).toEqual(expect.any(String))
    }
    const list = parse(PushSubscriptionList, (await call(API.pushSubscriptions)).json).items
    expect(list.every((s) => s.lastResult === 'failed')).toBe(true)
    expect(list).toHaveLength(2)
  })

  it('targets one subscription by the tail of its endpoint', async () => {
    await subscribe(deadEndpoint('aaaaaaaaaaaa'))
    const b = parse(PushSubscriptionInfo, (await subscribe(deadEndpoint('bbbbbbbbbbbb'))).json)
    const result = parse(PushSendResult, (await send({ title: 'One', targetEndpointTail: 'bbbbbbbbbbbb' })).json)
    expect(result.attempted).toBe(1)
    expect(result.results[0]?.id).toBe(b.id)
    expectError(await send({ title: 'None', targetEndpointTail: 'zzzzzzzz' }), 404, 'not_found')
  })

  it('schedules delayed sends at once, caps the queue, and drops it on reset', async () => {
    await subscribe()
    const delayed = await send({ title: 'Later', delaySec: 300 })
    expect(delayed.res.status).toBe(200)
    expect(parse(PushSendResult, delayed.json)).toMatchObject({ attempted: 1, delivered: 0, failed: 0, scheduledInSec: 300, results: [] })
    for (let i = 0; i < 24; i++) expect((await send({ title: `Later ${i}`, delaySec: 300 })).res.status).toBe(200)
    expectError(await send({ title: 'One too many', delaySec: 300 }), 429, 'rate_limited')
    await call(API.lab.reset, { method: 'POST' })
    expect((await send({ title: 'After reset', delaySec: 300 })).res.status).toBe(200)
  })

  it('caps the number of stored subscriptions', async () => {
    for (let i = 0; i < 50; i++) expect((await subscribe(deadEndpoint(`cap-${String(i).padStart(8, '0')}`))).res.status).toBe(201)
    expectError(await subscribe(deadEndpoint('cap-overflow-')), 429, 'rate_limited')
    expect((await subscribe(deadEndpoint(`cap-${String(3).padStart(8, '0')}`))).res.status).toBe(200)
  })
})

// ─── SSE ──────────────────────────────────────────────────────────────────────
describe('live event stream', () => {
  it('opens with hello then state, names each event after its type, and delivers log, state, wire and push events', async () => {
    const { events } = await import('./events')
    const stream = await openEvents()
    try {
      expect(stream.response.status).toBe(200)
      expect(stream.response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
      expect(stream.response.headers.get('cache-control')).toBe('no-store')
      expect(stream.response.headers.get('x-request-id')).toBeTruthy()
      const state = await stream.waitFor((e) => e.type === 'state')
      expect(stream.seen.map((e) => e.type).slice(0, 2)).toEqual(['hello', 'state'])
      expect(state.type === 'state' && parse(LabState, state.state).headerProfile).toBe('realistic')
      expect(events.clientCount).toBe(1)

      await call(API.lab.state)
      const ping = await call(API.ping, { headers: { 'X-Tab-Id': 'sse-tab' } })
      const logged = await stream.waitFor((e) => e.type === 'log')
      expect(logged.type === 'log' && logged.entry).toMatchObject({ path: '/api/ping', status: 204, tab: 'sse-tab', requestId: ping.res.headers.get('x-request-id') })

      await call(API.lab.headers, { method: 'PUT', json: { profile: 'no-store' } })
      const changed = await stream.waitFor((e) => e.type === 'state' && e.state.headerProfile === 'no-store')
      expect(changed.type).toBe('state')

      await subscribe(deadEndpoint('sse-push-001'))
      await call(API.lab.wire, { method: 'PUT', json: { pushOnNew: true } })
      const spawned = parse(WireSpawnResult, (await call(API.lab.wireSpawn, { method: 'POST' })).json).spawned[0]
      const wire = await stream.waitFor((e) => e.type === 'wire')
      expect(wire).toEqual({ type: 'wire', dispatchId: spawned?.id, severity: spawned?.severity, title: spawned?.title })
      const push = await stream.waitFor((e) => e.type === 'push')
      expect(push).toMatchObject({ type: 'push', attempted: 1, delivered: 0 })

      const only = stream.seen.filter((e) => e.type === 'log').map((e) => (e.type === 'log' ? e.entry.path : ''))
      expect(only.some((p) => p.startsWith('/api/_lab'))).toBe(false)
      for (const [i, name] of stream.names.entries()) expect(name).toBe(stream.seen[i]?.type)
    } finally {
      stream.close()
    }
    for (let i = 0; i < 40 && events.clientCount > 0; i++) await sleep(25)
    expect(events.clientCount).toBe(0)
  })

  it('does not announce API-filed dispatches as wire traffic', async () => {
    const stream = await openEvents()
    try {
      await stream.waitFor((e) => e.type === 'state')
      const filed = await file()
      await stream.waitFor((e) => e.type === 'log' && e.entry.method === 'POST' && e.entry.path === API.dispatches)
      expect(stream.seen.some((e) => e.type === 'wire')).toBe(false)
      expect(filed.id).toBeTruthy()
    } finally {
      stream.close()
    }
  })

  const subscribe = (endpoint: string): Promise<Reply> => call(API.pushSubscribe, { json: { subscription: { endpoint, keys: pushKeys() } } })
})

// ─── robustness ───────────────────────────────────────────────────────────────
describe('robustness', () => {
  it('serves a burst of concurrent mixed requests without a single 5xx', async () => {
    const cookie = await login()
    const jobs: Promise<Reply>[] = []
    for (let i = 0; i < 80; i++) {
      const pick = i % 8
      if (pick === 0) jobs.push(call(`${API.dispatches}?limit=${1 + (i % 20)}`))
      else if (pick === 1) jobs.push(call(API.dispatch(`dp-0000${10 + (i % 50)}`)))
      else if (pick === 2) jobs.push(call(API.signal))
      else if (pick === 3) jobs.push(call(API.dispatch(`dp-0000${10 + (i % 50)}`), { method: 'PATCH', json: { starred: i % 16 === 3 } }))
      else if (pick === 4) jobs.push(call(API.dispatches, { json: draft(), cookie }))
      else if (pick === 5) jobs.push(call(API.bench(BENCH_STRATEGIES[i % 5] ?? 'cache-first', BENCH_KEYS[i % 4] ?? 'alpha')))
      else if (pick === 6) jobs.push(call('/media/station/KRN-07.svg'))
      else jobs.push(call(API.inbox))
    }
    const replies = await Promise.all(jobs)
    for (const reply of replies) expect(reply.res.status).toBeLessThan(500)
    const total = parse(DispatchPage, (await call(`${API.dispatches}?limit=1`)).json).total
    expect(total).toBe(parse(LabState, (await call(API.lab.state)).json).counters.dispatches)
  })

  it('survives clients that abort at every stage', async () => {
    const before = unhandled.length
    await setChaos({ mode: 'hang', pathPrefix: '/api/dispatches' })
    const aborter = new AbortController()
    const hung = outcome(API.dispatches, { signal: aborter.signal })
    await sleep(80)
    aborter.abort()
    expect((await hung).kind).toBe('fetch-rejected')

    await setChaos({ mode: 'slow-body', pathPrefix: API.version })
    const slow = new AbortController()
    const res = await fetch(base + API.version, { signal: slow.signal })
    const reader = res.body?.getReader()
    await reader?.read()
    slow.abort()
    await expect(reader?.read()).rejects.toThrow()

    await setChaos({ mode: 'pass', latencyMs: 400, pathPrefix: '/api/stations' })
    const late = new AbortController()
    const delayed = outcome(API.stations, { signal: late.signal })
    await sleep(50)
    late.abort()
    expect((await delayed).kind).toBe('fetch-rejected')
    await setChaos(null)

    // A body that never finishes arriving: declared 1000 bytes, sent 6, then the socket is cut.
    await new Promise<void>((resolve) => {
      const req = httpRequest({ host: '127.0.0.1', port: server.port, path: API.session, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '1000' } })
      req.on('error', () => resolve())
      req.write('{"call')
      setTimeout(() => {
        req.destroy()
        resolve()
      }, 60)
    })
    // A request that is cut off before its headers are complete, and one that is plain garbage.
    await new Promise<void>((resolve) => {
      const socket = connect(server.port, '127.0.0.1', () => {
        socket.write('GET /api/dispatches HTTP/1.1\r\nHost: x\r\nX-Half')
        setTimeout(() => socket.destroy(), 40)
      })
      socket.on('close', () => resolve())
      socket.on('error', () => undefined)
    })
    const garbage = await new Promise<string>((resolve) => {
      const socket = connect(server.port, '127.0.0.1', () => socket.write('NOT HTTP AT ALL\r\n\r\n'))
      let data = ''
      socket.on('data', (chunk: Buffer) => {
        data += chunk.toString('utf8')
      })
      socket.on('close', () => resolve(data))
      socket.on('error', () => resolve(data))
    })
    expect(garbage).toMatch(/^HTTP\/1\.1 400/)

    const aborted = await findLog((e) => e.path === API.stations && e.status === 0)
    expect(aborted.chaos).toBe('test rule')
    expect((await call(API.ping)).res.status).toBe(204)
    expect(parse(DispatchPage, (await call(API.dispatches)).json).items.length).toBeGreaterThan(0)
    await sleep(100)
    expect(unhandled.slice(before)).toEqual([])
  })

  it('answers malformed URLs and headers with a 4xx, not a crash', async () => {
    for (const path of ['/%', '/api/dispatches/%E0%A4%A', '/media/dispatch/%ZZ.svg', '/%E0%A4%A', `/${'a'.repeat(9000)}`, '/api/dispatches?limit=%']) {
      const reply = await raw(path)
      expect(reply.status, path).toBeLessThan(500)
    }
    expect((await call(API.ping)).res.status).toBe(204)
  })

  it('stays consistent after hundreds of requests: counters, log and memory-bound state', async () => {
    await Promise.all(Array.from({ length: 200 }, () => call(API.ping)))
    const state = parse(LabState, (await call(API.lab.state)).json)
    expect(state.counters.requests).toBe(200)
    const log = parse(RequestLogPage, (await call(API.lab.log)).json)
    expect(log.entries.length).toBeLessThanOrEqual(500)
    expect(log.entries).toHaveLength(200)
    expect(new Set(log.entries.map((e) => e.seq)).size).toBe(200)
  })

  it('kept every promise: no unhandled rejection or uncaught exception during the whole run so far', () => {
    expect(unhandled).toEqual([])
  })
})

// ─── shutdown (last: it closes the server the other tests use) ────────────────
describe('shutdown', () => {
  it('ends open streams and hung requests and frees the port promptly', async () => {
    const stream = await openEvents()
    await stream.waitFor((e) => e.type === 'state')
    await setChaos({ mode: 'hang', pathPrefix: '/api/stations' })
    const hung = outcome(API.stations)
    await sleep(100)

    const started = Date.now()
    await server.close()
    expect(Date.now() - started).toBeLessThan(3500)
    expect((await hung).kind).toBe('fetch-rejected')
    stream.close()
    expect((await outcome(API.ping)).kind).toBe('fetch-rejected')
    expect(unhandled).toEqual([])
  })
})
