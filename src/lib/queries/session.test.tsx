// @vitest-environment jsdom
import type { QueryClient } from '@tanstack/react-query'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeServer, makeDispatch } from './fake-server'
import { formatCountdown, useClockIn, useClockOut, useSession, useSessionTimeLeft } from './session'
import { sessionPrompt, useSessionPrompt } from './session-prompt'
import { cleanupHooks, renderHook, settle, testClient, waitFor } from './test-harness'

let server: FakeServer
let client: QueryClient

beforeEach(() => {
  server = new FakeServer([makeDispatch(1)])
  client = testClient()
  vi.stubGlobal('fetch', server.fetch)
  sessionPrompt.close()
})
afterEach(() => {
  cleanupHooks()
  client.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('formatCountdown', () => {
  it('formats m:ss and h:mm:ss, rounding partial seconds up', () => {
    expect(formatCountdown(0)).toBe('0:00')
    expect(formatCountdown(1)).toBe('0:01')
    expect(formatCountdown(61_000)).toBe('1:01')
    expect(formatCountdown(599_400)).toBe('10:00')
    expect(formatCountdown(3_661_000)).toBe('1:01:01')
    expect(formatCountdown(-5000)).toBe('0:00')
  })
})

describe('session mutations', () => {
  it('clock-in stores the session, closes the prompt and does not wait for a refetch', async () => {
    server.session = null
    sessionPrompt.open('Your shift has lapsed.')
    const h = renderHook(() => ({ session: useSession(), clockIn: useClockIn(), clockOut: useClockOut() }), client)
    await waitFor(() => h.result.current.session.data !== undefined)
    expect(h.result.current.session.data?.session).toBeNull()

    await settle(() => h.result.current.clockIn.mutateAsync({ callsign: 'NORTH-9' }))

    expect(h.result.current.session.data?.session?.operator.callsign).toBe('NORTH-9')
    expect(useSessionPrompt.getState().open).toBe(false)
    expect(server.callsTo('POST', '/api/session')[0]?.body).toEqual({ callsign: 'NORTH-9' })
  })

  it('clock-out stores the signed-out answer', async () => {
    const h = renderHook(() => ({ session: useSession(), clockOut: useClockOut() }), client)
    await waitFor(() => h.result.current.session.data?.session !== undefined && h.result.current.session.data.session !== null)
    await settle(() => h.result.current.clockOut.mutateAsync())
    expect(h.result.current.session.data?.session).toBeNull()
    expect(server.session).toBeNull()
  })
})

describe('useSessionTimeLeft', () => {
  it('counts down, and refetches the session once when the time runs out', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    server.session = FakeServer.sessionFor('VEGA-2', 3)
    const h = renderHook(() => useSessionTimeLeft(), client)
    await waitFor(() => h.result.current.session !== null)
    expect(h.result.current).toMatchObject({ secondsLeft: 3, label: '0:03', expired: false })

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(h.result.current).toMatchObject({ secondsLeft: 1, label: '0:01', expired: false })
    expect(server.callsTo('GET', '/api/session')).toHaveLength(1)

    server.signedIn = false
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(h.result.current.expired).toBe(true)
    await waitFor(() => h.result.current.session === null)
    expect(server.callsTo('GET', '/api/session')).toHaveLength(2)
    expect(h.result.current).toMatchObject({ msLeft: null, label: null, expired: false })
  })

  it('is empty while signed out', async () => {
    server.session = null
    const h = renderHook(() => ({ left: useSessionTimeLeft(), session: useSession() }), client)
    await waitFor(() => h.result.current.session.data !== undefined)
    expect(h.result.current.left).toEqual({ session: null, expiresAt: null, msLeft: null, secondsLeft: null, expired: false, label: null })
  })
})
