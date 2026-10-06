// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNetLog } from '@/lib/api/net-log'
import * as endpoints from './endpoints'

interface Sent {
  method: string
  url: string
  body: unknown
  headers: Headers
  cache: RequestCache | undefined
}
const sent: Sent[] = []

beforeEach(() => {
  sent.length = 0
  useNetLog.getState().clear()
  // Answers every request with an empty object: each call then fails schema validation, which is fine here. The
  // request itself is what is under test.
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    sent.push({
      method: init?.method ?? 'GET',
      url: input,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: new Headers(init?.headers),
      cache: init?.cache,
    })
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
})
afterEach(() => vi.unstubAllGlobals())

const run = async (call: () => Promise<unknown>): Promise<Sent> => {
  await call().catch(() => undefined)
  const last = sent.at(-1)
  if (!last) throw new Error('no request was sent')
  return last
}

describe('endpoint requests', () => {
  const table: [string, () => Promise<unknown>, string, string, unknown?][] = [
    ['getSession', () => endpoints.getSession(), 'GET', '/api/session'],
    ['createSession', () => endpoints.createSession('VEGA-2'), 'POST', '/api/session', { callsign: 'VEGA-2' }],
    ['deleteSession', () => endpoints.deleteSession(), 'DELETE', '/api/session'],
    ['getDispatchPage', () => endpoints.getDispatchPage({ severity: 'urgent', unread: false, cursor: 'abc', q: 'ice cap' }), 'GET', '/api/dispatches?cursor=abc&q=ice+cap&severity=urgent&unread=false'],
    ['getDispatch', () => endpoints.getDispatch('dp-000001'), 'GET', '/api/dispatches/dp-000001'],
    ['getDispatch (encodes the id)', () => endpoints.getDispatch('a/b'), 'GET', '/api/dispatches/a%2Fb'],
    ['patchDispatch', () => endpoints.patchDispatch('dp-000001', { read: true }), 'PATCH', '/api/dispatches/dp-000001', { read: true }],
    ['getInbox', () => endpoints.getInbox(), 'GET', '/api/inbox/summary'],
    ['markAllRead', () => endpoints.markAllRead(), 'POST', '/api/inbox/read-all'],
    ['getDigest', () => endpoints.getDigest('2026-01-01T00:00:00.000Z'), 'GET', '/api/digest?since=2026-01-01T00%3A00%3A00.000Z'],
    ['getDigest (no since)', () => endpoints.getDigest(), 'GET', '/api/digest'],
    ['getStations', () => endpoints.getStations(), 'GET', '/api/stations'],
    ['getStation', () => endpoints.getStation('KRN-07'), 'GET', '/api/stations/KRN-07'],
    ['getSignal', () => endpoints.getSignal(), 'GET', '/api/signal'],
    ['getHandbookIndex', () => endpoints.getHandbookIndex(), 'GET', '/api/handbook'],
    ['getHandbookChapter', () => endpoints.getHandbookChapter('loss-of-contact'), 'GET', '/api/handbook/loss-of-contact'],
    ['getBench', () => endpoints.getBench('cache-only', 'delta'), 'GET', '/api/bench/cache-only/delta'],
    ['bumpBench', () => endpoints.bumpBench('network-first', 'alpha'), 'POST', '/api/bench/network-first/alpha/bump'],
    ['getPushVapid', () => endpoints.getPushVapid(), 'GET', '/api/push/vapid'],
    ['getPushSubscriptions', () => endpoints.getPushSubscriptions(), 'GET', '/api/push/subscriptions'],
    ['unsubscribePush', () => endpoints.unsubscribePush({ id: 'sub-1' }), 'POST', '/api/push/unsubscribe', { id: 'sub-1' }],
    ['sendPush', () => endpoints.sendPush({ kind: 'custom', title: 'Test' }), 'POST', '/api/push/send', { kind: 'custom', title: 'Test' }],
  ]
  it.each(table)('%s', async (_name, call, method, url, body) => {
    const request = await run(call)
    expect(request).toMatchObject({ method, url })
    expect(request.body).toEqual(body)
  })

  it('sends If-Match on a patch and the Idempotency-Key on a create', async () => {
    const patch = await run(() => endpoints.patchDispatch('dp-000001', { starred: true }, { ifMatch: 'W/"dp-000001-r3"' }))
    expect(patch.headers.get('If-Match')).toBe('W/"dp-000001-r3"')

    const create = await run(() =>
      endpoints.createDispatch({ clientId: 'key-12345678', stationId: 'st-krn07', title: 'Mast icing', body: 'Two centimetres.', severity: 'notice' }, 'key-12345678'),
    )
    expect(create.headers.get('Idempotency-Key')).toBe('key-12345678')
    expect(create.body).toMatchObject({ clientId: 'key-12345678' })
  })

  it('every answer is validated: an empty object is a schema mismatch, never data', async () => {
    await expect(endpoints.getInbox()).rejects.toMatchObject({ name: 'AppError', kind: 'schema-mismatch' })
  })

  it('sends the subscribe body as given', async () => {
    const request = { subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }, label: 'Laptop' }
    expect(await run(() => endpoints.subscribePush(request))).toMatchObject({ method: 'POST', url: '/api/push/subscribe', body: request })
  })
})

describe('lab endpoints', () => {
  const table: [string, () => Promise<unknown>, string, string, unknown?][] = [
    ['getLabState', () => endpoints.getLabState(), 'GET', '/api/_lab/state'],
    ['getLabTruth', () => endpoints.getLabTruth(), 'GET', '/api/_lab/truth'],
    ['putChaos', () => endpoints.putChaos({ serverOffline: true, schemaDrift: false, rules: [] }), 'PUT', '/api/_lab/chaos', { serverOffline: true, schemaDrift: false, rules: [] }],
    ['applyChaosPreset', () => endpoints.applyChaosPreset('lie-fi'), 'POST', '/api/_lab/chaos/preset/lie-fi'],
    ['putWire', () => endpoints.putWire({ auto: true }), 'PUT', '/api/_lab/wire', { auto: true }],
    ['spawnWire', () => endpoints.spawnWire({ count: 3, severity: 'urgent' }), 'POST', '/api/_lab/wire/spawn', { count: 3, severity: 'urgent' }],
    ['putRelease', () => endpoints.putRelease({ minClient: '9.0.0' }), 'PUT', '/api/_lab/release', { minClient: '9.0.0' }],
    ['putHeaderProfile', () => endpoints.putHeaderProfile({ profile: 'http-cache-trap' }), 'PUT', '/api/_lab/headers', { profile: 'http-cache-trap' }],
    ['controlSession', () => endpoints.controlSession({ action: 'set-ttl', ttlSec: 20 }), 'POST', '/api/_lab/session', { action: 'set-ttl', ttlSec: 20 }],
    ['getLabLog', () => endpoints.getLabLog(41), 'GET', '/api/_lab/log?since=41'],
    ['deleteLabLog', () => endpoints.deleteLabLog(), 'DELETE', '/api/_lab/log'],
    ['resetLab', () => endpoints.resetLab(), 'POST', '/api/_lab/reset'],
  ]
  it.each(table)('%s', async (_name, call, method, url, body) => {
    const request = await run(call)
    expect(request).toMatchObject({ method, url, cache: 'no-store' })
    expect(request.body).toEqual(body)
  })

  it('stays out of the client network log, which belongs to the product traffic', async () => {
    await run(() => endpoints.getLabState())
    await run(() => endpoints.getInbox())
    expect(useNetLog.getState().entries.map((e) => e.url)).toEqual(['/api/inbox/summary'])
  })
})
