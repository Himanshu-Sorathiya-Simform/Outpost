// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DISPATCH_DEPENDENTS, invalidateEverywhere } from './refresh'
import { qk } from './keys'

const broadcast = vi.hoisted(() => vi.fn<(key: readonly unknown[]) => void>())
vi.mock('@/lib/tabs/tab-sync', () => ({ broadcastInvalidate: broadcast, broadcastSessionChanged: vi.fn() }))

afterEach(() => broadcast.mockClear())

describe('invalidateEverywhere', () => {
  it('invalidates each key here and tells the other tabs about each one', () => {
    const qc = new QueryClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    invalidateEverywhere(qc, [qk.feeds(), qk.inbox()])
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([qk.feeds(), qk.inbox()])
    expect(broadcast.mock.calls.map(([key]) => key)).toEqual([qk.feeds(), qk.inbox()])
  })

  it('actually marks cached data stale', () => {
    const qc = new QueryClient()
    qc.setQueryData(qk.inbox(), 'x')
    invalidateEverywhere(qc, [qk.inbox()])
    expect(qc.getQueryState(qk.inbox())?.isInvalidated).toBe(true)
  })

  it('covers everything a dispatch write can change: the dispatches, the inbox counters, the digest', () => {
    expect(DISPATCH_DEPENDENTS).toEqual([qk.dispatches(), qk.inbox(), qk.digests()])
  })
})
