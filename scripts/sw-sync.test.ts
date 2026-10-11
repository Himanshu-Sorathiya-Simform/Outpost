import { describe, expect, it } from 'vitest'
import { HEALTHY, queuedRecord, readOutbox, seedOutbox, setup } from './sw-harness'

const created = (): Response => new Response(JSON.stringify({ id: 'dp-1' }), { status: 201, headers: { 'content-type': 'application/json' } })
const refused = (status: number, message: string): Response =>
  new Response(JSON.stringify({ error: { code: 'x', message, requestId: 'r' } }), { status, headers: { 'content-type': 'application/json' } })

/** Fires a `sync` event and resolves with what the worker handed to waitUntil: a rejection means the browser will retry. */
function fireSync(sw: ReturnType<typeof setup>, tag: string, lastChance = false): Promise<unknown> {
  let work: Promise<unknown> = Promise.resolve()
  sw.handler('sync')({ tag, lastChance, waitUntil: (p: Promise<unknown>) => void (work = p) })
  return work
}

/** Makes the worker's fetch answer POST /api/dispatches with these responses in turn (the last one repeats). */
function answerWith(sw: ReturnType<typeof setup>, ...responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  let n = 0
  sw.sandbox.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const next = responses[Math.min(n++, responses.length - 1)]
    if (next instanceof Error) throw next
    return (next as Response).clone()
  }) as never
  return calls
}

describe('the sync event', () => {
  it('registers a listener for sync', () => {
    expect(setup(HEALTHY).handlers.has('sync')).toBe(true)
  })

  it('ignores a tag that is not outbox-flush: it neither reads the outbox nor sends anything', async () => {
    const sw = setup(HEALTHY)
    await seedOutbox(sw, [queuedRecord('cid-00000001')])
    const calls = answerWith(sw, created())
    await fireSync(sw, 'something-else')
    expect(calls).toHaveLength(0)
    expect(await readOutbox(sw)).toHaveLength(1)
  })

  it('sends a queued dispatch once with the idempotency key, deletes it, and tells the pages and the channel', async () => {
    const sw = setup(HEALTHY)
    await seedOutbox(sw, [queuedRecord('cid-00000001')])
    const calls = answerWith(sw, created())
    await fireSync(sw, 'outbox-flush')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/api/dispatches')
    expect(calls[0]?.init?.headers).toMatchObject({ 'Idempotency-Key': 'cid-00000001', 'Content-Type': 'application/json' })
    expect(await readOutbox(sw)).toEqual([])
    const message = { type: 'sync-complete', tag: 'outbox-flush', succeeded: ['cid-00000001'], failed: [] }
    expect(sw.posted).toEqual([message])
    expect(sw.channelPosts).toEqual([{ channel: 'outpost-sw', message }])
  })

  it('resolves, and posts nothing, when the outbox is empty', async () => {
    const sw = setup(HEALTHY)
    answerWith(sw, created())
    await expect(fireSync(sw, 'outbox-flush')).resolves.toBeUndefined()
    expect(sw.posted).toEqual([])
    expect(sw.channelPosts).toEqual([])
  })

  it('REJECTS while a dispatch is still waiting, so the browser schedules another sync; the record stays queued with its reason', async () => {
    const sw = setup(HEALTHY)
    await seedOutbox(sw, [queuedRecord('cid-00000001')])
    answerWith(sw, new TypeError('Failed to fetch'))
    await expect(fireSync(sw, 'outbox-flush')).rejects.toThrow(/still waiting/)
    expect(await readOutbox(sw)).toEqual([expect.objectContaining({ status: 'queued', attempts: 1, lastError: 'The network did not answer (Failed to fetch).' })])
    expect(sw.posted).toEqual([{ type: 'sync-complete', tag: 'outbox-flush', succeeded: [], failed: ['cid-00000001'] }])
  })

  it('on the LAST chance marks what is waiting failed, says how many tries it took, and resolves', async () => {
    const sw = setup(HEALTHY)
    await seedOutbox(sw, [queuedRecord('cid-00000001', { attempts: 4 })])
    answerWith(sw, refused(503, 'Unavailable'))
    await expect(fireSync(sw, 'outbox-flush', true)).resolves.toBeUndefined()
    const [record] = await readOutbox(sw)
    expect(record).toMatchObject({ status: 'failed', attempts: 5 })
    expect(String(record?.lastError)).toMatch(/^Gave up after 5 tries: The server answered 503\./)
    expect(sw.posted).toEqual([{ type: 'sync-complete', tag: 'outbox-flush', succeeded: [], failed: ['cid-00000001'] }])
  })

  it('does not retry a record the server refused: it is marked failed, the run resolves, and the other records are still sent', async () => {
    const sw = setup(HEALTHY)
    await seedOutbox(sw, [queuedRecord('cid-00000001', { createdAt: '2026-01-01T00:00:00.000Z' }), queuedRecord('cid-00000002', { createdAt: '2026-01-02T00:00:00.000Z' })])
    answerWith(sw, refused(401, 'You are not clocked in'), created())
    await expect(fireSync(sw, 'outbox-flush')).resolves.toBeUndefined()
    expect(await readOutbox(sw)).toEqual([expect.objectContaining({ id: 'cid-00000001', status: 'failed', lastError: 'You are not clocked in' })])
    expect(sw.posted).toEqual([{ type: 'sync-complete', tag: 'outbox-flush', succeeded: ['cid-00000002'], failed: ['cid-00000001'] }])
  })

  it('leaves a failed record alone: only the page\'s "Retry all now" replays those', async () => {
    const sw = setup(HEALTHY)
    await seedOutbox(sw, [queuedRecord('cid-00000001', { status: 'failed', lastError: 'old' })])
    const calls = answerWith(sw, created())
    await fireSync(sw, 'outbox-flush')
    expect(calls).toHaveLength(0)
    expect(await readOutbox(sw)).toHaveLength(1)
  })

  it('retries a record left in `sending` by a run that died', async () => {
    const sw = setup(HEALTHY)
    await seedOutbox(sw, [queuedRecord('cid-00000001', { status: 'sending', attempts: 1 })])
    answerWith(sw, created())
    await fireSync(sw, 'outbox-flush')
    expect(await readOutbox(sw)).toEqual([])
  })

  it('takes the outbox lock, so two syncs at once send a record once', async () => {
    const sw = setup(HEALTHY)
    await seedOutbox(sw, [queuedRecord('cid-00000001')])
    const calls = answerWith(sw, created())
    await Promise.all([fireSync(sw, 'outbox-flush'), fireSync(sw, 'outbox-flush')])
    expect(calls).toHaveLength(1)
    expect(sw.lockNames).toEqual(['outpost-outbox-flush', 'outpost-outbox-flush'])
  })

  it('does not answer the page\'s own POST: a fetch of /api/dispatches with POST is left to the browser', async () => {
    const sw = setup(HEALTHY)
    expect(await sw.dispatch({ method: 'POST', url: 'http://localhost:4000/api/dispatches' })).toBe('not handled')
  })

  it('still tells the pages when only the channel is missing', async () => {
    const sw = setup(HEALTHY)
    sw.sandbox.BroadcastChannel = undefined as never
    await seedOutbox(sw, [queuedRecord('cid-00000001')])
    answerWith(sw, created())
    await fireSync(sw, 'outbox-flush')
    expect(sw.posted).toHaveLength(1)
  })
})
