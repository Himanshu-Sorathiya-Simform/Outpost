import { refCounted } from '@/lib/lifecycle'
import { markChunkLoadFailed } from '@/lib/version/status'
import { AppError } from './app-error'
import { errorCenter } from './center'
import { toAppError } from './normalize'

/** Unclassified failures arriving from outside any handler become `unhandled`; classified ones keep their kind. */
function classifyUncaught(reason: unknown, source: string): AppError {
  const normalized = toAppError(reason, { source })
  if (normalized.kind !== 'unknown') return normalized
  return new AppError({ kind: 'unhandled', message: normalized.message, cause: reason, context: { source } })
}

/** Raised by the browser when a ResizeObserver callback resizes something it observes. Nothing is broken. */
const BENIGN_MESSAGE = /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/

function onWindowError(event: Event): void {
  // Resource load failures (img, script, link) are plain Events that do not bubble to window. The resource log
  // shows those; only real script errors belong in the error centre.
  if (!(event instanceof ErrorEvent) || BENIGN_MESSAGE.test(event.message)) return
  const reason: unknown = event.error ?? new Error(event.message)
  errorCenter.report(classifyUncaught(reason, 'window.onerror'), { source: 'window.onerror' })
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  errorCenter.report(classifyUncaught(event.reason, 'unhandledrejection'), { source: 'unhandledrejection' })
}

/** Vite fires this when the preload helper for a dynamic import fails (stale hash after a deploy, or offline). */
function onPreloadError(event: Event): void {
  const payload: unknown = (event as Event & { payload?: unknown }).payload
  const normalized = toAppError(payload, { source: 'vite:preloadError' })
  const error =
    normalized.kind === 'chunk-load'
      ? normalized
      : new AppError({ kind: 'chunk-load', message: normalized.message, cause: payload, context: { source: 'vite:preloadError' } })
  markChunkLoadFailed()
  errorCenter.report(error, { source: 'vite:preloadError' })
  // Deliberately not calling preventDefault(): the import still rejects, so the route's errorElement renders.
}

/** Routes everything the page lets escape into the error centre. Idempotent; returns a disposer. */
export const installGlobalErrorHandlers = refCounted((): (() => void) => {
  window.addEventListener('error', onWindowError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  window.addEventListener('vite:preloadError', onPreloadError)
  return () => {
    window.removeEventListener('error', onWindowError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
    window.removeEventListener('vite:preloadError', onPreloadError)
  }
})
