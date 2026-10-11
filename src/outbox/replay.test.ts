import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { answers, item } from './outbox-test-helpers'
import { classify, replayOutbox } from './replay'
import { addIfAbsent, list } from './store'

const ALL = ['queued', 'sending', 'failed'] as const

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  fetchMock = vi.fn(async () => answers.created())
  vi.stubGlobal('fetch', fetchMock)
  // Web Locks are not in Node; a test that wants them stubs `navigator`.
  vi.stubGlobal('navigator', {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('classify', () => {
  it.each([
    ['a 201 with a JSON body', () => answers.created(), 'sent'],
    ['a 200 replay with a JSON body', () => answers.replay(), 'sent'],
    ['a 200 without the replay header', () => new Response('{}', { status: 200 }), 'retry'],
    ['a 201 whose body is HTML', () => new Response('<html>portal</html>', { status: 201 }), 'retry'],
    ['a 201 with an empty body', () => new Response('', { status: 201 }), 'retry'],
    ['a 401', () => answers.error(401, 'No session'), 'rejected'],
    ['a 403', () => answers.error(403, 'Cross origin'), 'rejected'],
    ['a 400', () => answers.error(400, 'Bad request'), 'rejected'],
    ['a 422', () => answers.error(422, 'Unknown station'), 'rejected'],
    ['a 404', () => answers.error(404, 'Not found'), 'rejected'],
    ['a 408', () => answers.error(408, 'Timeout'), 'retry'],
    ['a 429', () => answers.error(429, 'Slow down', { 'Retry-After': '5' }), 'retry'],
    ['a 500', () => answers.error(500, 'Boom'), 'retry'],
    ['a 503', () => answers.error(503, 'Unavailable'), 'retry'],
  ])('%s is %s', async (_name, make, kind) => {
    expect((await classify(make())).kind).toBe(kind)
  })

  it("uses the server's own message for a refusal, and the status when the body says nothing", async () => {
    expect(await classify(answers.error(422, 'Unknown station "ZZZ-99"'))).toMatchObject({ message: 'Unknown station "ZZZ-99"' })
    expect(await classify(new Response('not json', { status: 422 }))).toMatchObject({ message: 'The server refused it (422).' })
  })

  it('reads Retry-After from a 429, and copes with a missing or odd one', async () => {
    expect(await classify(answers.error(429, 'x', { 'Retry-After': '5' }))).toMatchObject({ stop: 'rate-limited', retryAfterSeconds: 5, message: expect.stringContaining('5 s') })
    expect(await classify(answers.error(429, 'x'))).toMatchObject({ stop: 'rate-limited', retryAfterSeconds: undefined })
    expect(await classify(answers.error(429, 'x', { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }))).toMatchObject({ retryAfterSeconds: undefined })
  })
})

describe('replayOutbox', () => {
  it('sends each record as the contract says: POST, JSON, Idempotency-Key = id, the payload as the body', async () => {
    await addIfAbsent(item('cid-00000001'))
    await replayOutbox(ALL)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/dispatches')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'Idempotency-Key': 'cid-00000001' })
    expect(JSON.parse(init.body as string)).toEqual(item('cid-00000001').payload)
  })

  it('deletes a created record and one the server already had, and reports them as succeeded, oldest first', async () => {
    await addIfAbsent(item('cid-00000002', { createdAt: '2026-01-02T00:00:00.000Z' }))
    await addIfAbsent(item('cid-00000001', { createdAt: '2026-01-01T00:00:00.000Z' }))
    fetchMock.mockResolvedValueOnce(answers.created()).mockResolvedValueOnce(answers.replay())
    const result = await replayOutbox(ALL)
    expect(result).toEqual({ succeeded: ['cid-00000001', 'cid-00000002'], failed: [], waiting: [], stoppedBecause: null })
    expect(await list()).toEqual([])
  })

  it('writes status sending and the new attempts to the record BEFORE the POST', async () => {
    await addIfAbsent(item('cid-00000001', { attempts: 2 }))
    let during: unknown
    fetchMock.mockImplementationOnce(async () => {
      during = (await list())[0]
      return answers.created()
    })
    await replayOutbox(ALL)
    expect(during).toMatchObject({ status: 'sending', attempts: 3 })
  })

  it('marks a refused record failed with the server message, keeps it, and carries on with the next', async () => {
    await addIfAbsent(item('cid-00000001', { createdAt: '2026-01-01T00:00:00.000Z' }))
    await addIfAbsent(item('cid-00000002', { createdAt: '2026-01-02T00:00:00.000Z' }))
    fetchMock.mockResolvedValueOnce(answers.error(401, 'You are not clocked in')).mockResolvedValueOnce(answers.created())
    const result = await replayOutbox(ALL)
    expect(result).toMatchObject({ succeeded: ['cid-00000002'], failed: ['cid-00000001'], waiting: [] })
    expect(await list()).toEqual([expect.objectContaining({ id: 'cid-00000001', status: 'failed', attempts: 1, lastError: 'You are not clocked in' })])
  })

  it('puts a record back to queued after a server error, with the status in lastError, and carries on', async () => {
    await addIfAbsent(item('cid-00000001', { createdAt: '2026-01-01T00:00:00.000Z' }))
    await addIfAbsent(item('cid-00000002', { createdAt: '2026-01-02T00:00:00.000Z' }))
    fetchMock.mockResolvedValueOnce(answers.error(503, 'Unavailable')).mockResolvedValueOnce(answers.created())
    const result = await replayOutbox(ALL)
    expect(result).toMatchObject({ succeeded: ['cid-00000002'], failed: [], waiting: ['cid-00000001'], stoppedBecause: null })
    expect(await list()).toEqual([expect.objectContaining({ status: 'queued', attempts: 1, lastError: 'The server answered 503.' })])
  })

  it('stops at a 429, leaves the rest untouched and counts them as waiting', async () => {
    for (const n of [1, 2, 3]) await addIfAbsent(item(`cid-0000000${n}`, { createdAt: `2026-01-0${n}T00:00:00.000Z` }))
    fetchMock.mockResolvedValueOnce(answers.created()).mockResolvedValueOnce(answers.error(429, 'Slow down', { 'Retry-After': '5' }))
    const result = await replayOutbox(ALL)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ succeeded: ['cid-00000001'], failed: [], waiting: ['cid-00000002', 'cid-00000003'], stoppedBecause: 'rate-limited' })
    const left = await list()
    expect(left.find((i) => i.id === 'cid-00000002')).toMatchObject({ status: 'queued', attempts: 1, lastError: expect.stringContaining('5 s') })
    expect(left.find((i) => i.id === 'cid-00000003')).toMatchObject({ status: 'queued', attempts: 0, lastError: null })
  })

  it('stops when the network is down, keeps the record queued and counts the rest as waiting', async () => {
    await addIfAbsent(item('cid-00000001', { createdAt: '2026-01-01T00:00:00.000Z' }))
    await addIfAbsent(item('cid-00000002', { createdAt: '2026-01-02T00:00:00.000Z' }))
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await replayOutbox(ALL)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ succeeded: [], failed: [], waiting: ['cid-00000001', 'cid-00000002'], stoppedBecause: 'offline' })
    expect((await list())[0]).toMatchObject({ status: 'queued', attempts: 1, lastError: 'The network did not answer (Failed to fetch).' })
  })

  it('does not count a 201 whose body is not JSON as filed', async () => {
    await addIfAbsent(item('cid-00000001'))
    fetchMock.mockResolvedValueOnce(new Response('<html>sign in</html>', { status: 201 }))
    const result = await replayOutbox(ALL)
    expect(result.waiting).toEqual(['cid-00000001'])
    expect(await list()).toHaveLength(1)
  })

  it('replays only the statuses it was asked for', async () => {
    await addIfAbsent(item('cid-00000001', { status: 'queued' }))
    await addIfAbsent(item('cid-00000002', { status: 'sending' }))
    await addIfAbsent(item('cid-00000003', { status: 'failed', lastError: 'old' }))
    await replayOutbox(['queued', 'sending'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((await list()).map((i) => i.id)).toEqual(['cid-00000003'])
    await replayOutbox(ALL)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(await list()).toEqual([])
  })

  it('does nothing, and sends nothing, when the outbox is empty', async () => {
    expect(await replayOutbox(ALL)).toEqual({ succeeded: [], failed: [], waiting: [], stoppedBecause: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a failed record that is retried and then accepted is deleted', async () => {
    await addIfAbsent(item('cid-00000001', { status: 'failed', lastError: 'You are not clocked in', attempts: 1 }))
    const result = await replayOutbox(ALL)
    expect(result.succeeded).toEqual(['cid-00000001'])
    expect(await list()).toEqual([])
  })
})

describe('the lock', () => {
  /** A minimal Web Locks: one holder at a time per name, the others queue. */
  function installLocks() {
    const tails = new Map<string, Promise<unknown>>()
    const names: string[] = []
    const request = vi.fn(async (name: string, callback: () => Promise<unknown>) => {
      names.push(name)
      const run = (tails.get(name) ?? Promise.resolve()).then(() => callback())
      tails.set(name, run.catch(() => undefined))
      return run
    })
    vi.stubGlobal('navigator', { locks: { request } })
    return { request, names }
  }

  it('takes the outbox lock around a run', async () => {
    const { names } = installLocks()
    await replayOutbox(ALL)
    expect(names).toEqual(['outpost-outbox-flush'])
  })

  it('makes two replayers that start together send each record once: the second waits and finds it gone', async () => {
    installLocks()
    await addIfAbsent(item('cid-00000001'))
    const [first, second] = await Promise.all([replayOutbox(ALL), replayOutbox(ALL)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first.succeeded).toEqual(['cid-00000001'])
    expect(second.succeeded).toEqual([])
  })

  it('still runs where Web Locks do not exist', async () => {
    await addIfAbsent(item('cid-00000001'))
    expect((await replayOutbox(ALL)).succeeded).toEqual(['cid-00000001'])
  })
})
