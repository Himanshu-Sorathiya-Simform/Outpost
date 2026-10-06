// @vitest-environment jsdom
import type { QueryClient } from '@tanstack/react-query'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InboxSummary } from '@shared/contracts'
import type { ApiResult, ResponseMeta } from '@/lib/api/types'
import { useBridgeLog } from '@/lib/bridge/seam'
import { qk } from '@/lib/queries/keys'
import { cleanupHooks, renderHook, testClient } from '@/lib/queries/test-harness'
import { PwaNotImplementedError } from '@/pwa/errors'
import { BADGE_DEBOUNCE_MS, useBadgeSync, useUnreadCount } from './useBadgeSync'

const badge = vi.hoisted(() => ({ set: vi.fn<(count: number) => Promise<void>>(), clear: vi.fn<() => Promise<void>>() }))
vi.mock('@/pwa', () => ({ pwa: { badge } }))

let client: QueryClient

const meta = { url: '/api/inbox/summary', status: 200 } as ResponseMeta
const summary = (unread: number): ApiResult<InboxSummary> => ({
  data: { unread, urgentUnread: 0, total: 20, feedRev: 1, asOf: '2026-01-01T00:00:00.000Z' },
  meta,
})

/** Puts a summary in the cache as if the inbox query had fetched it. Fresh for 15 s, so nothing is requested. */
const setUnread = (unread: number) => act(() => void client.setQueryData(qk.inbox(), summary(unread)))
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

beforeEach(() => {
  vi.useFakeTimers()
  client = testClient()
  badge.set.mockReset().mockResolvedValue(undefined)
  badge.clear.mockReset().mockResolvedValue(undefined)
  useBridgeLog.getState().clear()
})
afterEach(() => {
  cleanupHooks()
  client.clear()
  vi.useRealTimers()
})

describe('useUnreadCount', () => {
  it('is undefined until a summary exists, then the unread number', async () => {
    const h = renderHook(() => useUnreadCount(), client)
    expect(h.result.current).toBeUndefined()
    setUnread(6)
    await advance(10)
    expect(h.result.current).toBe(6)
  })
})

describe('useBadgeSync', () => {
  it('waits for the count to settle: a burst of changes writes the badge once, with the last value', async () => {
    renderHook(() => useBadgeSync(), client)
    setUnread(5)
    await advance(100)
    setUnread(4)
    await advance(100)
    setUnread(3)
    await advance(BADGE_DEBOUNCE_MS - 1)
    expect(badge.set).not.toHaveBeenCalled()

    await advance(1)
    expect(badge.set).toHaveBeenCalledTimes(1)
    expect(badge.set).toHaveBeenCalledWith(3)
  })

  it('skips a value equal to the one it last sent', async () => {
    renderHook(() => useBadgeSync(), client)
    setUnread(3)
    await advance(BADGE_DEBOUNCE_MS)
    expect(badge.set).toHaveBeenCalledTimes(1)

    // Same number again (a refetch that found nothing new), then through a different number and back within the window.
    setUnread(3)
    await advance(BADGE_DEBOUNCE_MS)
    setUnread(2)
    await advance(50)
    setUnread(3)
    await advance(BADGE_DEBOUNCE_MS)
    expect(badge.set).toHaveBeenCalledTimes(1)

    setUnread(1)
    await advance(BADGE_DEBOUNCE_MS)
    expect(badge.set.mock.calls).toEqual([[3], [1]])
  })

  it('clears the badge at zero instead of setting it to 0, and sets it again when mail returns', async () => {
    renderHook(() => useBadgeSync(), client)
    setUnread(2)
    await advance(BADGE_DEBOUNCE_MS)
    setUnread(0)
    await advance(BADGE_DEBOUNCE_MS)
    expect(badge.clear).toHaveBeenCalledTimes(1)
    expect(badge.set).toHaveBeenCalledTimes(1)

    setUnread(4)
    await advance(BADGE_DEBOUNCE_MS)
    expect(badge.set).toHaveBeenLastCalledWith(4)
  })

  it('syncs the very first value, even zero', async () => {
    renderHook(() => useBadgeSync(), client)
    setUnread(0)
    await advance(BADGE_DEBOUNCE_MS)
    expect(badge.clear).toHaveBeenCalledTimes(1)
  })

  it('does nothing until the inbox is known, and stops when unmounted mid-debounce', async () => {
    const h = renderHook(() => useBadgeSync(), client)
    await advance(1000)
    expect(badge.set).not.toHaveBeenCalled()
    expect(badge.clear).not.toHaveBeenCalled()

    setUnread(9)
    await advance(100)
    h.unmount()
    await advance(1000)
    expect(badge.set).not.toHaveBeenCalled()
  })

  it('treats a stubbed seam as a normal state: no throw, logged as not-implemented', async () => {
    badge.set.mockRejectedValue(new PwaNotImplementedError('badge.set'))
    renderHook(() => useBadgeSync(), client)
    setUnread(3)
    await advance(BADGE_DEBOUNCE_MS)
    expect(useBridgeLog.getState().entries[0]).toMatchObject({ feature: 'badge.set', outcome: 'not-implemented' })
    // Stub answers are final for that value: it is not hammered again.
    setUnread(3)
    await advance(BADGE_DEBOUNCE_MS)
    expect(badge.set).toHaveBeenCalledTimes(1)
  })

  it('survives a real failure: it is logged, and the next change is still synced', async () => {
    badge.set.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined)
    renderHook(() => useBadgeSync(), client)
    setUnread(3)
    await advance(BADGE_DEBOUNCE_MS)
    expect(useBridgeLog.getState().entries[0]).toMatchObject({ feature: 'badge.set', outcome: 'error' })

    setUnread(2)
    await advance(BADGE_DEBOUNCE_MS)
    setUnread(3)
    await advance(BADGE_DEBOUNCE_MS)
    expect(badge.set.mock.calls).toEqual([[3], [2], [3]])
    expect(useBridgeLog.getState().entries.map((e) => e.outcome)).toEqual(['ok', 'ok', 'error'])
  })
})
