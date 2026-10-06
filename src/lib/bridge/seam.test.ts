// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors/app-error'
import { errorCenter, useErrorCenter } from '@/lib/errors/center'
import { useToastStore } from '@/lib/notify'
import { PwaNotImplementedError } from '@/pwa/errors'
import { BRIDGE_LOG_RING_SIZE, callSeam, useBridgeLog } from './seam'

beforeEach(() => {
  errorCenter.clear()
  useBridgeLog.getState().clear()
  useToastStore.getState().clear()
})

const log = () => useBridgeLog.getState().entries
const stub = (): Promise<never> => Promise.reject(new PwaNotImplementedError('badge.set'))

describe('callSeam', () => {
  it('returns the value and logs ok with a duration', async () => {
    await expect(callSeam('badge.set', () => Promise.resolve(3))).resolves.toBe(3)
    expect(log()[0]).toMatchObject({ feature: 'badge.set', outcome: 'ok' })
    expect(log()[0]?.durationMs).toBeGreaterThanOrEqual(0)
    expect(log()[0]?.error).toBeUndefined()
  })

  it('accepts synchronous seams and catches synchronous throws', async () => {
    await expect(callSeam('notifications.permission', () => 'granted')).resolves.toBe('granted')
    await expect(
      callSeam('x', () => {
        throw new Error('sync')
      }),
    ).rejects.toBeInstanceOf(AppError)
  })

  it('throws not-implemented when loud, without reporting it', async () => {
    const error = await callSeam('badge.set', stub).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).kind).toBe('not-implemented')
    expect(log()[0]).toMatchObject({ outcome: 'not-implemented' })
    expect(useErrorCenter.getState().records).toHaveLength(0)
  })

  it('resolves undefined for not-implemented when quiet', async () => {
    await expect(callSeam('badge.set', stub, { quiet: true })).resolves.toBeUndefined()
    expect(log()[0]?.outcome).toBe('not-implemented')
  })

  it('reports other failures, rethrows them normalised, and only toasts when not quiet', async () => {
    const denied = () => Promise.reject(new DOMException('no', 'NotAllowedError'))
    await expect(callSeam('notifications.requestPermission', denied)).rejects.toMatchObject({ kind: 'permission' })
    expect(useErrorCenter.getState().records[0]).toMatchObject({ source: 'seam:notifications.requestPermission' })
    expect(useToastStore.getState().toasts).toHaveLength(1)

    useToastStore.getState().clear()
    await expect(callSeam('badge.set', denied, { quiet: true })).rejects.toMatchObject({ kind: 'permission' })
    expect(useToastStore.getState().toasts).toHaveLength(0)
    expect(log()[0]).toMatchObject({ outcome: 'error' })
    expect(log()[0]?.error?.kind).toBe('permission')
  })

  it('reads "x is not a function" from a browser API as unsupported', async () => {
    const missing = () => Promise.reject(new TypeError('navigator.setAppBadge is not a function'))
    await expect(callSeam('badge.set', missing)).rejects.toMatchObject({ kind: 'unsupported' })
  })

  it('keeps a bounded log, newest first', async () => {
    for (let i = 0; i < BRIDGE_LOG_RING_SIZE + 5; i += 1) await callSeam(`f${i}`, () => i)
    expect(log()).toHaveLength(BRIDGE_LOG_RING_SIZE)
    expect(log()[0]?.feature).toBe(`f${BRIDGE_LOG_RING_SIZE + 4}`)
  })
})
