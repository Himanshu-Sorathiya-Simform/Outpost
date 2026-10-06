// @vitest-environment jsdom
import type { QueryClient } from '@tanstack/react-query'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateDispatchInput } from './dispatches'
import { newClientId, useCreateDispatch, useDispatch, useDispatchFeed, usePatchDispatch } from './dispatches'
import { errorCenter, useErrorCenter } from '@/lib/errors/center'
import { useToastStore } from '@/lib/notify'
import { useInbox } from './inbox'
import { FakeServer, errorResponse, makeDispatch } from './fake-server'
import { qk } from './keys'
import { sessionPrompt, useSessionPrompt } from './session-prompt'
import { useLabSettings } from '@/lib/settings/lab-settings'
import type { Dispatch } from '@shared/contracts'
import type { ApiResult } from '@/lib/api/types'
import { cleanupHooks, flush, renderHook, settle, testClient, waitFor } from './test-harness'

// Five dispatches, newest first: 1 routine unread, 2 urgent unread, 3 critical read, 4 notice unread, 5 routine unread.
// Inbox: unread 4, urgentUnread 1.
const seed = () => [
  makeDispatch(1),
  makeDispatch(2, { severity: 'urgent' }),
  makeDispatch(3, { severity: 'critical', read: true }),
  makeDispatch(4, { severity: 'notice' }),
  makeDispatch(5),
]
const URGENT = 'dp-000002'

let server: FakeServer
let client: QueryClient

beforeEach(() => {
  server = new FakeServer(seed())
  client = testClient()
  vi.stubGlobal('fetch', server.fetch)
  errorCenter.clear()
  useToastStore.getState().clear()
  sessionPrompt.close()
})
afterEach(() => {
  cleanupHooks()
  client.clear()
  vi.unstubAllGlobals()
})

/** Two feeds (all, urgent only), the urgent dispatch's detail, the inbox and the patch mutation, all loaded. */
async function mountLoaded() {
  const h = renderHook(
    () => ({
      all: useDispatchFeed(),
      urgent: useDispatchFeed({ severity: 'urgent' }),
      detail: useDispatch(URGENT),
      inbox: useInbox(),
      patch: usePatchDispatch(),
    }),
    client,
  )
  await waitFor(() => {
    const r = h.result.current
    return r.all.items.length === 5 && r.urgent.items.length === 1 && r.detail.data !== undefined && r.inbox.data !== undefined
  })
  return h
}

const itemIn = (items: { id: string; read: boolean }[], id: string) => items.find((d) => d.id === id)

describe('usePatchDispatch: optimistic update', () => {
  it('changes the detail, every cached feed and the inbox counters before the server has answered', async () => {
    const h = await mountLoaded()
    const release = server.hold('PATCH')

    let pending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      pending = h.result.current.patch.mutateAsync({ id: URGENT, patch: { read: true } })
    })
    await waitFor(() => h.result.current.detail.data?.read === true)

    const r = h.result.current
    expect(itemIn(r.all.items, URGENT)?.read).toBe(true)
    expect(itemIn(r.urgent.items, URGENT)?.read).toBe(true)
    expect(r.inbox.data).toMatchObject({ unread: 3, urgentUnread: 0 })
    // The revision belongs to the server: the optimistic copy must not invent one.
    expect(r.detail.data?.rev).toBe(1)
    expect(server.dispatches.find((d) => d.id === URGENT)?.read).toBe(false)

    await act(async () => {
      release()
      await pending
    })
    await waitFor(() => !client.isFetching())
    expect(h.result.current.detail.data).toMatchObject({ read: true, rev: 2 })
    expect(h.result.current.inbox.data).toMatchObject({ unread: 3, urgentUnread: 0 })
  })

  it('leaves the inbox counters alone when the read flag does not actually change', async () => {
    const h = await mountLoaded()
    const release = server.hold('PATCH')
    let pending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      pending = h.result.current.patch.mutateAsync({ id: URGENT, patch: { read: false } })
    })
    // dp-2 is already unread: nothing moves.
    expect(h.result.current.inbox.data).toMatchObject({ unread: 4, urgentUnread: 1 })
    await act(async () => {
      release()
      await pending
    })
  })

  it('moves the counters back up when a read dispatch is marked unread', async () => {
    const h = renderHook(() => ({ detail: useDispatch('dp-000003'), inbox: useInbox(), patch: usePatchDispatch() }), client)
    await waitFor(() => h.result.current.detail.data !== undefined && h.result.current.inbox.data !== undefined)
    const release = server.hold('PATCH')
    let pending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      pending = h.result.current.patch.mutateAsync({ id: 'dp-000003', patch: { read: false } })
    })
    await waitFor(() => h.result.current.detail.data?.read === false)
    // dp-3 is critical, so it counts towards urgentUnread as well.
    expect(h.result.current.inbox.data).toMatchObject({ unread: 5, urgentUnread: 2 })
    await act(async () => {
      release()
      await pending
    })
  })

  it('sends If-Match built from the revision the user saw', async () => {
    const h = await mountLoaded()
    await settle(() => h.result.current.patch.mutateAsync({ id: URGENT, patch: { starred: true } }))
    const [call] = server.callsTo('PATCH', `/api/dispatches/${URGENT}`)
    expect(call?.headers.get('If-Match')).toBe('W/"dp-000002-r1"')
    expect(call?.body).toEqual({ starred: true })
  })

  it('uses the newest revision any cache holds, so a fresher detail avoids a false conflict', async () => {
    const h = await mountLoaded()
    server.mutateBehindBack(URGENT, { starred: true }) // server rev 2; the feeds still hold rev 1
    await act(async () => {
      await client.invalidateQueries({ queryKey: qk.dispatch(URGENT) })
    })
    await waitFor(() => h.result.current.detail.data?.rev === 2)

    await settle(() => h.result.current.patch.mutateAsync({ id: URGENT, patch: { read: true } }))
    expect(server.callsTo('PATCH', `/api/dispatches/${URGENT}`)[0]?.headers.get('If-Match')).toBe('W/"dp-000002-r2"')
    expect(h.result.current.patch.isSuccess).toBe(true)
  })

  it('runs patches one at a time so the second carries the revision the first produced', async () => {
    const h = await mountLoaded()
    await act(async () => {
      await Promise.all([
        h.result.current.patch.mutateAsync({ id: URGENT, patch: { read: true } }),
        h.result.current.patch.mutateAsync({ id: URGENT, patch: { starred: true } }),
      ])
    })
    const ifMatch = server.callsTo('PATCH', `/api/dispatches/${URGENT}`).map((c) => c.headers.get('If-Match'))
    expect(ifMatch).toEqual(['W/"dp-000002-r1"', 'W/"dp-000002-r2"'])
    expect(server.dispatches.find((d) => d.id === URGENT)).toMatchObject({ read: true, starred: true, rev: 3 })
  })
})

describe('usePatchDispatch: failure', () => {
  it('puts every cache back when the server rejects the write, and surfaces an AppError', async () => {
    const h = await mountLoaded()
    // Keep revalidation from papering over the rollback: nothing refetches until released.
    const releaseReads = server.hold('GET')
    server.failNext('PATCH', '/api/dispatches', () => errorResponse(500, 'internal', 'boom'))

    await settle(() => h.result.current.patch.mutateAsync({ id: URGENT, patch: { read: true } }))

    const r = h.result.current
    expect(r.patch.error?.kind).toBe('server')
    expect(r.detail.data?.read).toBe(false)
    expect(itemIn(r.all.items, URGENT)?.read).toBe(false)
    expect(itemIn(r.urgent.items, URGENT)?.read).toBe(false)
    expect(r.inbox.data).toMatchObject({ unread: 4, urgentUnread: 1 })
    expect(useErrorCenter.getState().records[0]?.error.kind).toBe('server')
    releaseReads()
  })

  it('rolls back only the write that failed: a second write still waiting its turn keeps its optimistic state', async () => {
    const h = await mountLoaded()
    const releaseReads = server.hold('GET')
    // The first patch (dp-000001) is refused. The second (dp-000002) queues behind it and is then held in flight.
    server.failNext('PATCH', '/api/dispatches/dp-000001', () => errorResponse(500, 'internal', 'boom'))
    let releaseSecond: () => void = () => undefined
    const secondMayLand = new Promise<void>((resolve) => (releaseSecond = resolve))
    let secondSent = false
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      if (init?.method === 'PATCH' && String(input).endsWith(URGENT)) {
        secondSent = true
        await secondMayLand
      }
      return server.fetch(input, init)
    })

    let first: Promise<unknown> = Promise.resolve()
    let second: Promise<unknown> = Promise.resolve()
    await act(async () => {
      first = h.result.current.patch.mutateAsync({ id: 'dp-000001', patch: { starred: true } }).catch(() => undefined)
      second = h.result.current.patch.mutateAsync({ id: URGENT, patch: { starred: true } })
    })
    await waitFor(() => secondSent)
    await first

    const r = h.result.current
    expect(itemIn(r.all.items, 'dp-000001')).toMatchObject({ starred: false })
    // dp-000002's write has not landed and has not failed: it must still show as done.
    expect(r.detail.data?.starred).toBe(true)
    expect(r.all.items.find((d) => d.id === URGENT)?.starred).toBe(true)

    await act(async () => {
      releaseSecond()
      await second
    })
    releaseReads()
  })

  it('keeps newer server data that arrived while the write was in flight when the write then fails', async () => {
    const h = await mountLoaded()
    const release = server.hold('PATCH')
    server.failNext('PATCH', '/api/dispatches', () => errorResponse(500, 'internal', 'boom'))
    let pending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      pending = h.result.current.patch.mutateAsync({ id: URGENT, patch: { read: true } }).catch(() => undefined)
    })
    // Someone else stars dp-000002, and this tab learns of it (a focus refetch, a pushed invalidation) mid-flight.
    const fresh = server.mutateBehindBack(URGENT, { starred: true })
    client.setQueryData<ApiResult<Dispatch>>(qk.dispatch(URGENT), (old) => old && { ...old, data: fresh })
    const releaseReads = server.hold('GET')
    await act(async () => {
      release()
      await pending
    })
    // The failed `read` is undone; the other operator's `starred` is not thrown away with it.
    expect(h.result.current.detail.data).toMatchObject({ starred: true, read: false })
    releaseReads()
  })

  it('rejects mutateAsync with an AppError, never a raw error', async () => {
    const h = await mountLoaded()
    server.failNext('PATCH', '/api/dispatches', () => errorResponse(500, 'internal', 'boom'))
    let caught: unknown
    await act(async () => {
      caught = await h.result.current.patch.mutateAsync({ id: URGENT, patch: { read: true } }).catch((e: unknown) => e)
    })
    expect(caught).toMatchObject({ name: 'AppError', kind: 'server' })
  })

  it('on a 412 replaces the caches with the server copy and says it changed elsewhere', async () => {
    const h = await mountLoaded()
    const releaseReads = server.hold('GET')
    server.mutateBehindBack(URGENT, { starred: true }) // someone else starred it: server rev 2

    await settle(() => h.result.current.patch.mutateAsync({ id: URGENT, patch: { read: true } }))

    const r = h.result.current
    expect(r.patch.error?.kind).toBe('conflict')
    // The server's copy, not ours: starred by them, not read by us. The optimistic read was undone.
    expect(r.detail.data).toMatchObject({ rev: 2, starred: true, read: false })
    expect(r.all.items.find((d) => d.id === URGENT)).toMatchObject({ rev: 2, starred: true, read: false })
    expect(r.urgent.items[0]).toMatchObject({ rev: 2, starred: true })
    expect(r.inbox.data).toMatchObject({ unread: 4, urgentUnread: 1 })
    const toast = useToastStore.getState().toasts.find((t) => t.title === 'Changed elsewhere')
    expect(toast?.tone).toBe('warn')
    releaseReads()
  })

  it('on a bare 409 (no current copy) still rolls back and refetches', async () => {
    const h = await mountLoaded()
    server.failNext('PATCH', '/api/dispatches', () => errorResponse(409, 'conflict', 'duplicate'))
    const before = server.callsTo('GET', `/api/dispatches/${URGENT}`).length

    await settle(() => h.result.current.patch.mutateAsync({ id: URGENT, patch: { read: true } }))
    await waitFor(() => server.callsTo('GET', `/api/dispatches/${URGENT}`).length > before)

    expect(h.result.current.patch.error?.kind).toBe('conflict')
    expect(h.result.current.detail.data?.read).toBe(false)
  })

  it('on a 401 opens the clock-in prompt, rolls back, and refetches the session', async () => {
    const h = await mountLoaded()
    server.signedIn = false
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await settle(() => h.result.current.patch.mutateAsync({ id: URGENT, patch: { acked: true } }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.session() })

    expect(h.result.current.patch.error?.kind).toBe('unauthorized')
    expect(h.result.current.detail.data?.acked).toBe(false)
    expect(useSessionPrompt.getState()).toMatchObject({ open: true })
    expect(useSessionPrompt.getState().reason).toMatch(/acknowledging/i)
  })

  it('does not ask for a session on writes that never needed one', async () => {
    const h = await mountLoaded()
    server.signedIn = false
    await settle(() => h.result.current.patch.mutateAsync({ id: URGENT, patch: { starred: true } }))
    expect(h.result.current.patch.isSuccess).toBe(true)
    expect(useSessionPrompt.getState().open).toBe(false)
  })
})

describe('usePatchDispatch: settling', () => {
  it('invalidates dispatches, inbox and digest once the write has landed', async () => {
    const h = await mountLoaded()
    const spy = vi.spyOn(client, 'invalidateQueries')
    await settle(() => h.result.current.patch.mutateAsync({ id: URGENT, patch: { starred: true } }))
    const keys = spy.mock.calls.map(([filters]) => filters?.queryKey)
    expect(keys).toEqual(expect.arrayContaining([qk.dispatches(), qk.inbox(), qk.digests()]))
  })
})

describe('useDispatchFeed', () => {
  it('flattens pages in order, pages on demand, and exposes per-page meta', async () => {
    server = new FakeServer(Array.from({ length: 30 }, (_, i) => makeDispatch(i + 1)))
    vi.stubGlobal('fetch', server.fetch)
    const h = renderHook(() => useDispatchFeed({ limit: 12 }), client)
    await waitFor(() => h.result.current.items.length === 12)

    let feed = h.result.current
    expect(feed.hasNextPage).toBe(true)
    expect(feed.total).toBe(30)
    expect(feed.feedRev).toBe(1)
    expect(feed.pageMetas).toHaveLength(1)
    expect(feed.meta?.status).toBe(200)

    await act(async () => {
      await feed.fetchNextPage()
    })
    await flush()
    feed = h.result.current
    expect(feed.items).toHaveLength(24)
    expect(feed.items.map((d) => d.id).slice(10, 14)).toEqual(['dp-000011', 'dp-000012', 'dp-000013', 'dp-000014'])
    expect(feed.pageMetas).toHaveLength(2)
    expect(server.callsTo('GET', '/api/dispatches')[1]?.query.get('cursor')).toBe('12')

    await act(async () => {
      await feed.fetchNextPage()
    })
    await flush()
    feed = h.result.current
    expect(feed.items).toHaveLength(30)
    expect(feed.hasNextPage).toBe(false)
  })

  it('keeps each filter set in its own cache entry', async () => {
    const h = renderHook(() => ({ all: useDispatchFeed(), urgent: useDispatchFeed({ severity: 'urgent' }) }), client)
    await waitFor(() => h.result.current.all.items.length === 5 && h.result.current.urgent.items.length === 1)
    expect(client.getQueryCache().findAll({ queryKey: qk.feeds() })).toHaveLength(2)
    expect(server.callsTo('GET', '/api/dispatches').map((c) => c.query.get('severity')).sort()).toEqual([null, 'urgent'])
  })

  it('asks the server for the normalised filters, the same ones the cache key is built from', async () => {
    const h = renderHook(() => useDispatchFeed({ q: '  mast  ', station: '', unread: false }), client)
    await waitFor(() => h.result.current.items.length > 0 || h.result.current.isSuccess)
    const [call] = server.callsTo('GET', '/api/dispatches')
    expect(call?.query.get('q')).toBe('mast')
    expect(call?.query.has('station')).toBe(false)
    expect(call?.query.get('unread')).toBe('false')
  })

  it('never lists a dispatch twice, even if a patched cache repeats one', async () => {
    const h = renderHook(() => useDispatchFeed(), client)
    await waitFor(() => h.result.current.items.length === 5)
    const key = qk.feed()
    await act(async () => {
      client.setQueryData(key, (old: unknown) => {
        const data = old as { pages: { data: { items: unknown[] } }[]; pageParams: unknown[] }
        const first = data.pages[0]
        if (!first) return old
        return { ...data, pages: [first, { ...first }], pageParams: [...data.pageParams, '5'] }
      })
    })
    await waitFor(() => h.result.current.pageMetas.length === 2)
    expect(h.result.current.items).toHaveLength(5)
  })
})

describe('useCreateDispatch', () => {
  const input: CreateDispatchInput = { stationId: 'st-krn07', title: 'Mast icing', body: 'Two centimetres on the guy wires.', severity: 'notice', tags: [], coords: null }

  const mountCreate = () => renderHook(() => ({ create: useCreateDispatch(), feed: useDispatchFeed(), inbox: useInbox() }), client)

  it('sends the clientId as the Idempotency-Key, generating one when absent', async () => {
    const h = mountCreate()
    await settle(() => h.result.current.create.mutateAsync(input))
    const [call] = server.callsTo('POST', '/api/dispatches')
    const key = call?.headers.get('Idempotency-Key')
    expect(key).toBeTruthy()
    expect(key && key.length).toBeGreaterThanOrEqual(8)
    expect(call?.body).toMatchObject({ clientId: key, title: 'Mast icing' })
    expect(h.result.current.create.data?.data.clientId).toBe(key)
    expect(h.result.current.create.data?.meta.status).toBe(201)
  })

  it('uses a clientId the caller supplies, and the same one twice files once', async () => {
    const h = mountCreate()
    const clientId = newClientId()
    await settle(() => h.result.current.create.mutateAsync({ ...input, clientId }))
    await settle(() => h.result.current.create.mutateAsync({ ...input, clientId }))

    const keys = server.callsTo('POST', '/api/dispatches').map((c) => c.headers.get('Idempotency-Key'))
    expect(keys).toEqual([clientId, clientId])
    expect(server.dispatches).toHaveLength(6)
    // The repeat is a replay: 200 rather than 201, same dispatch.
    expect(h.result.current.create.data?.meta.status).toBe(200)
    expect(h.result.current.create.data?.data.clientId).toBe(clientId)
  })

  it('refreshes the feed and the inbox after filing', async () => {
    const h = mountCreate()
    await waitFor(() => h.result.current.feed.items.length === 5 && h.result.current.inbox.data !== undefined)
    await settle(() => h.result.current.create.mutateAsync(input))
    await waitFor(() => h.result.current.feed.items.length === 6 && h.result.current.inbox.data?.unread === 5)
    expect(h.result.current.feed.items[0]?.title).toBe('Mast icing')
  })

  it('retries a 503 with the same key, and reports the key on a failure that is not retried', async () => {
    useLabSettings.getState().set({ retries: 1 })
    const h = mountCreate()
    const clientId = newClientId()
    server.failNext('POST', '/api/dispatches', () => errorResponse(503, 'unavailable', 'down'))
    await settle(() => h.result.current.create.mutateAsync({ ...input, clientId }))
    const keys = server.callsTo('POST', '/api/dispatches').map((c) => c.headers.get('Idempotency-Key'))
    expect(keys).toEqual([clientId, clientId])
    expect(h.result.current.create.isSuccess).toBe(true)

    server.failNext('POST', '/api/dispatches', () => errorResponse(422, 'validation_failed', 'Title too short'))
    await settle(() => h.result.current.create.mutateAsync({ ...input, title: 'x' }))
    expect(h.result.current.create.error?.kind).toBe('validation')
    expect(h.result.current.create.error?.context.clientId).toEqual(expect.any(String))
    expect(server.callsTo('POST', '/api/dispatches')).toHaveLength(3)
  })

  it('does not queue anything itself: a dead link is just an AppError for the page to act on', async () => {
    const h = mountCreate()
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    await settle(() => h.result.current.create.mutateAsync(input))
    expect(h.result.current.create.error?.kind).toBe('network')
    expect(h.result.current.create.error?.context.clientId).toEqual(expect.any(String))
  })

  it('opens the clock-in prompt when filing is refused for lack of a session', async () => {
    server.signedIn = false
    const h = mountCreate()
    await settle(() => h.result.current.create.mutateAsync(input))
    expect(h.result.current.create.error?.kind).toBe('unauthorized')
    expect(useSessionPrompt.getState().open).toBe(true)
  })
})
