import { beforeEach, describe, expect, it } from 'vitest'
import { useToastStore } from '@/lib/notify'
import { AppError } from './app-error'
import { ERROR_RING_SIZE, errorCenter, useErrorCenter } from './center'

beforeEach(() => {
  errorCenter.clear()
  useToastStore.getState().clear()
})

const net = (url = '/api/a') => new AppError({ kind: 'network', message: 'fetch() rejected', context: { url } })
const records = () => useErrorCenter.getState().records

describe('errorCenter', () => {
  it('normalises whatever it is given and returns the AppError', () => {
    const err = errorCenter.report(new Error('plain'), { source: 'test' })
    expect(err).toBeInstanceOf(AppError)
    expect(records()[0]).toMatchObject({ source: 'test', count: 1 })
  })

  it('collapses adjacent duplicates into one counted row', () => {
    errorCenter.report(net())
    errorCenter.report(net())
    errorCenter.report(net())
    expect(records()).toHaveLength(1)
    expect(records()[0]?.count).toBe(3)
  })

  it('does not collapse errors that differ in url, or duplicates separated by another error', () => {
    errorCenter.report(net('/api/a'))
    errorCenter.report(net('/api/b'))
    errorCenter.report(net('/api/a'))
    expect(records().map((r) => r.count)).toEqual([1, 1, 1])
  })

  it('keeps the newest occurrence in a collapsed row but the first id and time', () => {
    const first = errorCenter.report(net())
    const second = errorCenter.report(net())
    const row = records()[0]
    expect(row?.id).toBe(first.id)
    expect(row?.error).toBe(second)
    expect(row?.lastAt).toBeGreaterThanOrEqual(row?.firstAt ?? 0)
  })

  it('bounds the ring and keeps newest first', () => {
    for (let i = 0; i < ERROR_RING_SIZE + 25; i += 1) errorCenter.report(new Error(`e${i}`))
    expect(records()).toHaveLength(ERROR_RING_SIZE)
    expect(records()[0]?.error.message).toBe(`e${ERROR_RING_SIZE + 24}`)
    expect(useErrorCenter.getState().counts.unknown).toBe(ERROR_RING_SIZE + 25)
  })

  it('counts per kind including collapsed repeats, and clear() resets both', () => {
    errorCenter.report(net())
    errorCenter.report(net())
    errorCenter.report(new AppError({ kind: 'quota', message: 'full' }))
    expect(useErrorCenter.getState().counts).toMatchObject({ network: 2, quota: 1, timeout: 0 })
    errorCenter.clear()
    expect(records()).toHaveLength(0)
    expect(useErrorCenter.getState().counts.network).toBe(0)
  })

  it('toasts by default, replaces per kind, and stays quiet when silent', () => {
    errorCenter.report(net('/api/a'))
    errorCenter.report(net('/api/b'))
    expect(useToastStore.getState().toasts).toHaveLength(1)
    errorCenter.report(new AppError({ kind: 'quota', message: 'full' }), { silent: true })
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('records aborted and not-implemented without a toast', () => {
    errorCenter.report(new AppError({ kind: 'aborted', message: 'x' }))
    errorCenter.report(new AppError({ kind: 'not-implemented', message: 'y' }))
    expect(records()).toHaveLength(2)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})
