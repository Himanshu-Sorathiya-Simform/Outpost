import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { DispatchPage, InboxSummary } from '@shared/contracts'
import type { ApiResult, ResponseMeta } from '@/lib/api/types'
import {
  applyOptimisticPatch,
  dispatchEtag,
  findCachedDispatch,
  inboxAfterReadChange,
  restoreCaches,
  snapshotCaches,
  storeDispatch,
  type FeedData,
} from './dispatch-cache'
import { makeDispatch } from './fake-server'
import { qk } from './keys'

// Only the fields the cache helpers carry through; they never read meta.
const meta = { url: '/api/x', status: 200 } as ResponseMeta
const result = <T>(data: T): ApiResult<T> => ({ data, meta })

const summary: InboxSummary = { unread: 4, urgentUnread: 2, total: 10, feedRev: 7, asOf: '2026-01-01T00:00:00.000Z' }

function feed(items: ReturnType<typeof makeDispatch>[]): FeedData {
  const page: DispatchPage = { items, nextCursor: null, total: items.length, feedRev: 1 }
  return { pages: [result(page)], pageParams: [undefined] }
}

describe('inboxAfterReadChange', () => {
  it('moves unread by one, and urgentUnread only for urgent and critical', () => {
    expect(inboxAfterReadChange(summary, { read: false, severity: 'routine' }, true)).toMatchObject({ unread: 3, urgentUnread: 2 })
    expect(inboxAfterReadChange(summary, { read: false, severity: 'urgent' }, true)).toMatchObject({ unread: 3, urgentUnread: 1 })
    expect(inboxAfterReadChange(summary, { read: false, severity: 'critical' }, true)).toMatchObject({ unread: 3, urgentUnread: 1 })
    expect(inboxAfterReadChange(summary, { read: true, severity: 'critical' }, false)).toMatchObject({ unread: 5, urgentUnread: 3 })
  })

  it('is a no-op when the flag does not change, and never goes below zero', () => {
    expect(inboxAfterReadChange(summary, { read: true, severity: 'urgent' }, true)).toBe(summary)
    const empty = { ...summary, unread: 0, urgentUnread: 0 }
    expect(inboxAfterReadChange(empty, { read: false, severity: 'urgent' }, true)).toMatchObject({ unread: 0, urgentUnread: 0 })
  })
})

describe('cache helpers', () => {
  it('builds the same validator the server does', () => {
    expect(dispatchEtag({ id: 'dp-000123', rev: 4 })).toBe('W/"dp-000123-r4"')
  })

  it('finds the highest revision across detail and feeds', () => {
    const qc = new QueryClient()
    qc.setQueryData(qk.dispatch('dp-000001'), result(makeDispatch(1, { rev: 2 })))
    qc.setQueryData(qk.feed(), feed([makeDispatch(1, { rev: 5 })]))
    qc.setQueryData(qk.feed({ severity: 'urgent' }), feed([makeDispatch(1, { rev: 3 })]))
    expect(findCachedDispatch(qc, 'dp-000001')?.rev).toBe(5)
    expect(findCachedDispatch(qc, 'dp-999999')).toBeUndefined()
  })

  it('does not invent a detail entry, an inbox, or a feed it was never given', () => {
    const qc = new QueryClient()
    applyOptimisticPatch(qc, 'dp-000001', { read: true })
    expect(qc.getQueryCache().getAll()).toHaveLength(0)
  })

  it('ignores explicit undefined in a patch instead of erasing the field', () => {
    const qc = new QueryClient()
    qc.setQueryData(qk.dispatch('dp-000001'), result(makeDispatch(1, { starred: true })))
    applyOptimisticPatch(qc, 'dp-000001', { read: true, starred: undefined })
    expect(qc.getQueryData<ApiResult<ReturnType<typeof makeDispatch>>>(qk.dispatch('dp-000001'))?.data).toMatchObject({ read: true, starred: true })
  })

  it('snapshots and restores raw cache data, skipping queries that had none', () => {
    const qc = new QueryClient()
    const original = result(makeDispatch(1))
    qc.setQueryData(qk.dispatch('dp-000001'), original)
    const snap = snapshotCaches(qc, qk.dispatch('dp-000001'), qk.inbox())
    applyOptimisticPatch(qc, 'dp-000001', { read: true })
    restoreCaches(qc, snap)
    expect(qc.getQueryData(qk.dispatch('dp-000001'))).toEqual(original)
    expect(qc.getQueryData(qk.inbox())).toBeUndefined()
  })

  it('storeDispatch updates feeds and an existing detail, and only creates a detail when given a response', () => {
    const qc = new QueryClient()
    qc.setQueryData(qk.feed(), feed([makeDispatch(1), makeDispatch(2)]))
    const fresh = makeDispatch(2, { rev: 9, starred: true })

    storeDispatch(qc, fresh)
    expect(qc.getQueryData(qk.dispatch('dp-000002'))).toBeUndefined()
    expect(qc.getQueryData<FeedData>(qk.feed())?.pages[0]?.data.items[1]).toEqual(fresh)

    storeDispatch(qc, fresh, meta)
    expect(qc.getQueryData<ApiResult<typeof fresh>>(qk.dispatch('dp-000002'))).toEqual({ data: fresh, meta })
  })
})
