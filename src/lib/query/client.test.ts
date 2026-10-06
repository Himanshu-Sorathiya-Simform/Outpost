// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors/app-error'
import { errorCenter, useErrorCenter } from '@/lib/errors/center'
import { LAB_SETTING_DEFAULTS, useLabSettings } from '@/lib/settings/lab-settings'
import { RETRY_DELAY_CAP_MS, createQueryClient, liveDefaults, queryClient, retryDelayMs, shouldRetry, startQuerySettingsSync } from './client'

beforeEach(() => {
  errorCenter.clear()
  useLabSettings.getState().reset()
})
afterEach(() => useLabSettings.getState().reset())

const net = () => new AppError({ kind: 'network', message: 'down' })

describe('retry policy', () => {
  it('retries retryable AppErrors up to the configured count', () => {
    expect(shouldRetry(0, net(), 2)).toBe(true)
    expect(shouldRetry(1, net(), 2)).toBe(true)
    expect(shouldRetry(2, net(), 2)).toBe(false)
    expect(shouldRetry(0, net(), 0)).toBe(false)
  })

  it('never retries non-retryable kinds or foreign errors', () => {
    expect(shouldRetry(0, new AppError({ kind: 'unauthorized', message: '401' }), 5)).toBe(false)
    expect(shouldRetry(0, new AppError({ kind: 'schema-mismatch', message: 'shape' }), 5)).toBe(false)
    expect(shouldRetry(0, new Error('plain'), 5)).toBe(false)
  })

  it('reads the retry count from the live lab setting by default', () => {
    useLabSettings.getState().set({ retries: 0 })
    expect(shouldRetry(0, net())).toBe(false)
    useLabSettings.getState().set({ retries: 3 })
    expect(shouldRetry(2, net())).toBe(true)
  })

  it('backs off exponentially with jitter, capped at 8 s', () => {
    expect(retryDelayMs(0, net(), () => 0)).toBe(500)
    expect(retryDelayMs(1, net(), () => 0)).toBe(1000)
    expect(retryDelayMs(2, net(), () => 1)).toBe(3000) // 2000 + up to 50% jitter
    expect(retryDelayMs(10, net(), () => 1)).toBe(RETRY_DELAY_CAP_MS)
  })

  it('honours Retry-After as a floor, still under the cap', () => {
    const limited = new AppError({ kind: 'rate-limited', message: '429', context: { retryAfterSec: 4 } })
    expect(retryDelayMs(0, limited, () => 0)).toBe(4000)
    const hostile = new AppError({ kind: 'rate-limited', message: '429', context: { retryAfterSec: 600 } })
    expect(retryDelayMs(0, hostile, () => 0)).toBe(RETRY_DELAY_CAP_MS)
  })
})

describe('defaults from lab settings', () => {
  it('converts units and carries the network mode', () => {
    const d = liveDefaults({ ...LAB_SETTING_DEFAULTS, staleTimeSec: 5, gcTimeMin: 2, networkMode: 'always', refetchOnFocus: false })
    expect(d.queries).toMatchObject({ staleTime: 5000, gcTime: 120_000, networkMode: 'always', refetchOnWindowFocus: false })
    expect(d.mutations).toMatchObject({ networkMode: 'always' })
  })

  it('a new client starts from the current settings, offlineFirst by default', () => {
    const client = createQueryClient()
    expect(client.getDefaultOptions().queries).toMatchObject({ staleTime: 30_000, gcTime: 1440 * 60_000, networkMode: 'offlineFirst', refetchOnWindowFocus: true })
    expect(client.getDefaultOptions().mutations?.retry).toBe(false)
  })

  it('applies setting changes live to the shared client and stops when disposed', () => {
    const stop = startQuerySettingsSync()
    useLabSettings.getState().set({ staleTimeSec: 99, networkMode: 'online', refetchOnFocus: false })
    expect(queryClient.getDefaultOptions().queries).toMatchObject({ staleTime: 99_000, networkMode: 'online', refetchOnWindowFocus: false })
    expect(queryClient.getDefaultOptions().mutations?.networkMode).toBe('online')
    // the retry policy functions must survive the merge
    expect(typeof queryClient.getDefaultOptions().queries?.retry).toBe('function')
    stop()
    useLabSettings.getState().set({ staleTimeSec: 1 })
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(99_000)
  })
})

describe('error reporting from the caches', () => {
  const records = () => useErrorCenter.getState().records

  it('reports failed queries silently with their hash as source', async () => {
    const client = createQueryClient()
    await client.fetchQuery({ queryKey: ['dispatches'], queryFn: () => Promise.reject(net()), retry: false }).catch(() => undefined)
    expect(records()).toHaveLength(1)
    expect(records()[0]?.source).toBe('query:["dispatches"]')
    expect(records()[0]?.error.kind).toBe('network')
  })

  it('skips queries marked meta.silent and aborted requests', async () => {
    const client = createQueryClient()
    await client.fetchQuery({ queryKey: ['quiet'], meta: { silent: true }, queryFn: () => Promise.reject(net()), retry: false }).catch(() => undefined)
    await client.fetchQuery({ queryKey: ['aborted'], queryFn: () => Promise.reject(new AppError({ kind: 'aborted', message: 'x' })), retry: false }).catch(() => undefined)
    expect(records()).toHaveLength(0)
  })

  it('reports failed mutations unless silent', async () => {
    const client = createQueryClient()
    const run = (meta?: Record<string, unknown>) =>
      client
        .getMutationCache()
        .build(client, { mutationKey: ['patch'], meta, mutationFn: () => Promise.reject(net()) })
        .execute(undefined)
        .catch(() => undefined)
    await run({ silent: true })
    expect(records()).toHaveLength(0)
    await run()
    expect(records()).toHaveLength(1)
    expect(records()[0]?.source).toBe('mutation:patch')
  })
})
