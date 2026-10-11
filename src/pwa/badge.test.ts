import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toAppError } from '@/lib/errors/normalize'
import { badge } from './badge'

let setAppBadge: ReturnType<typeof vi.fn>
let clearAppBadge: ReturnType<typeof vi.fn>

beforeEach(() => {
  setAppBadge = vi.fn(async () => undefined)
  clearAppBadge = vi.fn(async () => undefined)
  vi.stubGlobal('navigator', { setAppBadge, clearAppBadge })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('badge.set', () => {
  it('asks the browser for the count', async () => {
    await badge.set(7)
    expect(setAppBadge).toHaveBeenCalledExactlyOnceWith(7)
    expect(clearAppBadge).not.toHaveBeenCalled()
  })

  it('clears the badge at 0 (setAppBadge(0) is a clear too, and this is the one call)', async () => {
    await badge.set(0)
    expect(clearAppBadge).toHaveBeenCalledTimes(1)
    expect(setAppBadge).not.toHaveBeenCalled()
  })

  it.each([[-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])('rejects %s with a RangeError and asks the browser nothing', async (count) => {
    await expect(badge.set(count)).rejects.toBeInstanceOf(RangeError)
    expect(setAppBadge).not.toHaveBeenCalled()
    expect(clearAppBadge).not.toHaveBeenCalled()
  })

  it('throws NotSupportedError where the browser has no Badging API, which the app classifies as unsupported', async () => {
    vi.stubGlobal('navigator', {})
    const error = await badge.set(3).catch((thrown: unknown) => thrown)
    expect(error).toMatchObject({ name: 'NotSupportedError' })
    expect(toAppError(error, { source: 'test' }).kind).toBe('unsupported')
  })

  it('lets a refusal from the browser through', async () => {
    setAppBadge.mockRejectedValueOnce(new DOMException('Not allowed', 'NotAllowedError'))
    await expect(badge.set(3)).rejects.toMatchObject({ name: 'NotAllowedError' })
  })

  it('treats half an API as unsupported, because both functions are needed', async () => {
    vi.stubGlobal('navigator', { setAppBadge })
    await expect(badge.set(3)).rejects.toMatchObject({ name: 'NotSupportedError' })
  })
})

describe('badge.clear', () => {
  it('asks the browser to clear it', async () => {
    await badge.clear()
    expect(clearAppBadge).toHaveBeenCalledTimes(1)
  })

  it('throws NotSupportedError where the browser has no Badging API', async () => {
    vi.stubGlobal('navigator', {})
    await expect(badge.clear()).rejects.toMatchObject({ name: 'NotSupportedError' })
  })

  it('reports unsupported, not a crash, where there is no navigator at all', async () => {
    vi.stubGlobal('navigator', undefined)
    await expect(badge.clear()).rejects.toMatchObject({ name: 'NotSupportedError' })
  })
})
