import { z } from 'zod'
import { PwaNotImplementedError } from '@/pwa/errors'
import { AppError, type AppErrorContext, type AppErrorKind } from './app-error'

/**
 * Extra hints a caller can give the normaliser. Anything else in here becomes part of `AppError.context`.
 */
export interface NormalizeContext extends AppErrorContext {
  /**
   * The caller was invoking a browser API (callSeam sets this). Only then is `TypeError: x is not a function`
   * read as "this browser lacks the API" — anywhere else the same message is an ordinary bug.
   */
  apiCall?: boolean
}

/** What bundlers and browsers say when `import()` (a lazy route chunk) fails. */
const CHUNK_LOAD_MESSAGES: readonly RegExp[] = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Loading (CSS )?chunk [\w-]+ failed/i, // webpack-era wording, still seen in the wild
]

/** What fetch() rejects with, per engine, when nothing came back at all. */
const FETCH_FAILURE_MESSAGES: readonly RegExp[] = [
  /^Failed to fetch\b/i, // Chromium
  /NetworkError when attempting to fetch resource/i, // Firefox
  /^Load failed$/i, // Safari
  /Network request failed/i,
  /^fetch failed$/i, // undici (Node, tests)
]

const MISSING_API_MESSAGE = /(is not a function|is not a constructor)\s*$/i

/** DOMException / Error names that map 1:1 onto a kind. */
const KIND_BY_NAME: Readonly<Record<string, AppErrorKind>> = {
  AbortError: 'aborted',
  CancelledError: 'aborted', // TanStack Query's own cancellation
  TimeoutError: 'timeout',
  NotAllowedError: 'permission',
  SecurityError: 'permission',
  NotSupportedError: 'unsupported',
  QuotaExceededError: 'quota',
  NS_ERROR_DOM_QUOTA_REACHED: 'quota', // older Firefox
  NetworkError: 'network',
  ChunkLoadError: 'chunk-load',
}

interface ErrorLike {
  name: string
  message: string
}

function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === 'object' && value !== null && typeof (value as ErrorLike).name === 'string' && typeof (value as ErrorLike).message === 'string'
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function isChunkLoadMessage(message: string): boolean {
  return CHUNK_LOAD_MESSAGES.some((re) => re.test(message))
}

/** "path: message" lines, capped so a hostile payload cannot flood the error centre. */
export function formatZodIssues(issues: readonly z.core.$ZodIssue[], max = 8): string[] {
  const lines = issues.slice(0, max).map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
  if (issues.length > max) lines.push(`…and ${issues.length - max} more`)
  return lines
}

function describeThrown(value: unknown): string {
  if (isErrorLike(value)) return value.message || value.name
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * Turns anything that can be thrown into an AppError. Rules, in order:
 * AppError (returned untouched) → PwaNotImplementedError → ZodError → dynamic-import failures →
 * known Error/DOMException names → fetch transport failures → missing-API TypeErrors (callers opt in) → unknown.
 */
export function toAppError(err: unknown, ctx: NormalizeContext = {}): AppError {
  if (AppError.is(err)) return err

  const { apiCall, ...context } = ctx
  const make = (kind: AppErrorKind, message: string, extra?: AppErrorContext) =>
    new AppError({ kind, message, cause: err, context: { ...context, ...extra } })

  if (err instanceof PwaNotImplementedError) return make('not-implemented', err.message, { feature: err.feature })

  if (err instanceof z.ZodError) {
    const issues = formatZodIssues(err.issues)
    return make('schema-mismatch', `Data failed validation: ${issues[0] ?? 'unknown issue'}`, { issues })
  }

  if (isErrorLike(err)) {
    const { name, message } = err

    if (isChunkLoadMessage(message)) return make('chunk-load', message)

    const byName = KIND_BY_NAME[name]
    if (byName === 'network') return make(isBrowserOffline() ? 'offline' : 'network', message)
    if (byName) return make(byName, message)

    if (name === 'TypeError') {
      if (FETCH_FAILURE_MESSAGES.some((re) => re.test(message))) return make(isBrowserOffline() ? 'offline' : 'network', message)
      if (apiCall && MISSING_API_MESSAGE.test(message)) return make('unsupported', message)
    }
    return make('unknown', message || name)
  }

  return make('unknown', describeThrown(err))
}
