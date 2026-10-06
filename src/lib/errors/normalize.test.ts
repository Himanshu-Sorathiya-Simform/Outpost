// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { PwaNotImplementedError } from '@/pwa/errors'
import { AppError } from './app-error'
import { formatZodIssues, isChunkLoadMessage, toAppError } from './normalize'

afterEach(() => vi.restoreAllMocks())

const setOnline = (online: boolean): void => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
}

describe('toAppError', () => {
  it('passes an AppError through untouched', () => {
    const original = new AppError({ kind: 'forbidden', message: 'no' })
    expect(toAppError(original, { source: 'x' })).toBe(original)
  })

  it('maps PwaNotImplementedError to not-implemented and keeps the feature name', () => {
    const err = toAppError(new PwaNotImplementedError('badge.set', 'use setAppBadge'))
    expect(err.kind).toBe('not-implemented')
    expect(err.context.feature).toBe('badge.set')
    expect(err.retryable).toBe(false)
  })

  it('maps a ZodError to schema-mismatch and lists the issues', () => {
    const parsed = z.object({ a: z.string(), b: z.number() }).safeParse({ a: 1, b: 'x' })
    if (parsed.success) throw new Error('expected failure')
    const err = toAppError(parsed.error)
    expect(err.kind).toBe('schema-mismatch')
    expect(err.context.issues).toEqual(expect.arrayContaining([expect.stringMatching(/^a:/), expect.stringMatching(/^b:/)]))
  })

  it.each([
    ['Chromium', 'Failed to fetch dynamically imported module: http://x/assets/Page-abc.js'],
    ['Firefox', 'error loading dynamically imported module: http://x/assets/Page-abc.js'],
    ['Safari', 'Importing a module script failed.'],
    ['webpack-style', 'Loading chunk 12 failed.'],
  ])('recognises the %s dynamic-import failure as chunk-load', (_engine, message) => {
    // Chromium throws these as TypeErrors whose text also contains "Failed to fetch"; chunk-load must win.
    const err = toAppError(new TypeError(message))
    expect(err.kind).toBe('chunk-load')
    expect(isChunkLoadMessage(message)).toBe(true)
  })

  it('recognises an Error named ChunkLoadError', () => {
    const e = new Error('boom')
    e.name = 'ChunkLoadError'
    expect(toAppError(e).kind).toBe('chunk-load')
  })

  it.each([
    ['AbortError', 'aborted'],
    ['TimeoutError', 'timeout'],
    ['NotAllowedError', 'permission'],
    ['SecurityError', 'permission'],
    ['NotSupportedError', 'unsupported'],
    ['QuotaExceededError', 'quota'],
  ] as const)('maps DOMException %s to %s', (name, kind) => {
    expect(toAppError(new DOMException('msg', name)).kind).toBe(kind)
  })

  it('maps TanStack Query cancellation to aborted', () => {
    const e = new Error('cancelled')
    e.name = 'CancelledError'
    expect(toAppError(e).kind).toBe('aborted')
  })

  it.each(['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'Network request failed', 'fetch failed'])(
    'reads TypeError "%s" as a network failure',
    (message) => {
      setOnline(true)
      expect(toAppError(new TypeError(message)).kind).toBe('network')
    },
  )

  it('reads the same fetch TypeError as offline when the browser says so', () => {
    setOnline(false)
    expect(toAppError(new TypeError('Failed to fetch')).kind).toBe('offline')
  })

  it('treats "x is not a function" as unsupported only when the caller is invoking a browser API', () => {
    const err = new TypeError('navigator.setAppBadge is not a function')
    expect(toAppError(err).kind).toBe('unknown')
    const flagged = toAppError(err, { apiCall: true })
    expect(flagged.kind).toBe('unsupported')
    expect(flagged.context.apiCall).toBeUndefined()
  })

  it('classifies plain Errors, strings and arbitrary values as unknown', () => {
    expect(toAppError(new Error('plain')).message).toBe('plain')
    expect(toAppError('just a string').message).toBe('just a string')
    expect(toAppError({ code: 7 }).message).toBe('{"code":7}')
    expect(toAppError(undefined).kind).toBe('unknown')
    expect(toAppError(null).kind).toBe('unknown')
  })

  it('keeps the original as cause and merges the supplied context', () => {
    const original = new Error('plain')
    const err = toAppError(original, { source: 'route:/log', url: '/api/x' })
    expect(err.cause).toBe(original)
    expect(err.context).toMatchObject({ source: 'route:/log', url: '/api/x' })
  })
})

describe('formatZodIssues', () => {
  it('caps the list and says how many were cut', () => {
    const result = z.array(z.string()).safeParse(Array.from({ length: 12 }, () => 1))
    if (result.success) throw new Error('expected failure')
    const lines = formatZodIssues(result.error.issues, 3)
    expect(lines).toHaveLength(4)
    expect(lines[3]).toMatch(/9 more/)
  })
})
