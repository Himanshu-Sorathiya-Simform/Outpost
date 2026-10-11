import { afterEach, describe, expect, it, vi } from 'vitest'
import { toAppError } from '@/lib/errors/normalize'
import { share } from './share'

afterEach(() => {
  vi.unstubAllGlobals()
})

const DATA = { title: 'Link dropped', text: 'Feeder SWR jumped', url: 'http://localhost:4000/log/dp-000064' }

describe('share.canShare', () => {
  it('asks the browser about the payload and returns its answer', () => {
    const canShare = vi.fn(() => true)
    vi.stubGlobal('navigator', { canShare })
    expect(share.canShare(DATA)).toBe(true)
    expect(canShare).toHaveBeenCalledExactlyOnceWith(DATA)
    vi.stubGlobal('navigator', { canShare: () => false })
    expect(share.canShare(DATA)).toBe(false)
  })

  it('is false where the browser has no canShare, or there is no navigator at all', () => {
    vi.stubGlobal('navigator', { share: vi.fn() })
    expect(share.canShare(DATA)).toBe(false)
    vi.stubGlobal('navigator', undefined)
    expect(share.canShare(DATA)).toBe(false)
  })

  it('is false, and does not throw, when the browser rejects the payload by throwing', () => {
    vi.stubGlobal('navigator', {
      canShare: () => {
        throw new TypeError('Invalid share data')
      },
    })
    expect(share.canShare(DATA)).toBe(false)
  })

  it('passes files through to the browser, which decides whether it can share them', () => {
    const canShare = vi.fn((data: { files?: File[] }) => data.files === undefined)
    vi.stubGlobal('navigator', { canShare })
    const file = new File(['x'], 'log.txt', { type: 'text/plain' })
    expect(share.canShare({ files: [file] })).toBe(false)
    expect(share.canShare({ url: DATA.url })).toBe(true)
  })
})

describe('share.share', () => {
  it('hands the payload to the share sheet and says it was shared', async () => {
    const shareFn = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { share: shareFn })
    await expect(share.share(DATA)).resolves.toBe('shared')
    expect(shareFn).toHaveBeenCalledExactlyOnceWith(DATA)
  })

  it('calls the browser before any await, so the click\'s user activation is still fresh', () => {
    const shareFn = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { share: shareFn })
    void share.share(DATA)
    expect(shareFn).toHaveBeenCalledTimes(1)
  })

  it('maps AbortError (the person closed the sheet) to cancelled', async () => {
    vi.stubGlobal('navigator', { share: async () => Promise.reject(new DOMException('Share canceled', 'AbortError')) })
    await expect(share.share(DATA)).resolves.toBe('cancelled')
  })

  it('says unsupported where there is no navigator.share, or no navigator', async () => {
    vi.stubGlobal('navigator', {})
    await expect(share.share(DATA)).resolves.toBe('unsupported')
    vi.stubGlobal('navigator', undefined)
    await expect(share.share(DATA)).resolves.toBe('unsupported')
  })

  it.each([
    ['NotAllowedError', 'Must be handling a user gesture to perform a share request.', 'permission'],
    ['DataError', 'Unable to share', 'unknown'],
  ])('lets a %s through unchanged: it is a failure, not a cancel', async (name, message) => {
    vi.stubGlobal('navigator', { share: async () => Promise.reject(new DOMException(message, name)) })
    await expect(share.share(DATA)).rejects.toMatchObject({ name, message })
  })

  it('lets a TypeError from an empty payload through, and the app files it as the browser\'s own complaint', async () => {
    vi.stubGlobal('navigator', { share: async () => Promise.reject(new TypeError('Failed to execute share: at least one of title, text, url or files is required')) })
    const error = await share.share({}).catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(TypeError)
    expect(toAppError(error, { source: 'test' }).kind).not.toBe('aborted')
  })

  it('classifies a NotAllowedError as a permission problem, so the page says "Sharing was blocked"', async () => {
    vi.stubGlobal('navigator', { share: async () => Promise.reject(new DOMException('No gesture', 'NotAllowedError')) })
    const error = await share.share(DATA).catch((thrown: unknown) => thrown)
    expect(toAppError(error, { source: 'test' }).kind).toBe('permission')
  })
})
