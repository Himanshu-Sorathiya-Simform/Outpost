// @vitest-environment jsdom
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorCenter } from '@/lib/errors/center'
import { useDispatchFeed } from './dispatches'
import { FakeServer, errorResponse, makeDispatch } from './fake-server'
import { useInbox, useMarkAllRead } from './inbox'
import { cleanupHooks, renderHook, settle, testClient, waitFor } from './test-harness'

let server: FakeServer
let client: QueryClient

beforeEach(() => {
  server = new FakeServer([makeDispatch(1), makeDispatch(2, { severity: 'urgent' }), makeDispatch(3, { read: true }), makeDispatch(4)])
  client = testClient()
  vi.stubGlobal('fetch', server.fetch)
  errorCenter.clear()
})
afterEach(() => {
  cleanupHooks()
  client.clear()
  vi.unstubAllGlobals()
})

const mount = () => renderHook(() => ({ feed: useDispatchFeed(), inbox: useInbox(), readAll: useMarkAllRead() }), client)
const loaded = async () => {
  const h = mount()
  await waitFor(() => h.result.current.feed.items.length === 4 && h.result.current.inbox.data !== undefined)
  return h
}

describe('useMarkAllRead', () => {
  it('reads as everything read at once, before the server answers', async () => {
    const h = await loaded()
    expect(h.result.current.inbox.data).toMatchObject({ unread: 3, urgentUnread: 1 })
    const release = server.hold('POST')

    const pending = h.result.current.readAll.mutateAsync()
    await waitFor(() => h.result.current.inbox.data?.unread === 0)
    expect(h.result.current.inbox.data?.urgentUnread).toBe(0)
    expect(h.result.current.feed.items.every((d) => d.read)).toBe(true)

    release()
    await pending
    // The server bumped every revision it touched; the revalidated feed carries them.
    await waitFor(() => h.result.current.feed.items.find((d) => d.id === 'dp-000001')?.rev === 2)
    expect(h.result.current.inbox.data?.unread).toBe(0)
  })

  it('puts the counters and the list back when the write fails', async () => {
    const h = await loaded()
    const releaseReads = server.hold('GET')
    server.failNext('POST', '/api/inbox/read-all', () => errorResponse(503, 'unavailable', 'down'))

    await settle(() => h.result.current.readAll.mutateAsync())

    expect(h.result.current.readAll.error?.kind).toBe('unavailable')
    expect(h.result.current.inbox.data).toMatchObject({ unread: 3, urgentUnread: 1 })
    expect(h.result.current.feed.items.filter((d) => !d.read)).toHaveLength(3)
    releaseReads()
  })
})
