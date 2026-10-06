import { create } from 'zustand'
import type { AppError } from '@/lib/errors/app-error'
import { errorCenter } from '@/lib/errors/center'
import { toAppError } from '@/lib/errors/normalize'

export const BRIDGE_LOG_RING_SIZE = 200

export type SeamOutcome = 'ok' | 'not-implemented' | 'error'

/** One call from the website into src/pwa. */
export interface BridgeLogEntry {
  id: number
  /** Epoch ms. */
  at: number
  /** 'badge.set', 'sync.listQueued', ... */
  feature: string
  outcome: SeamOutcome
  durationMs: number
  error?: AppError
}

interface BridgeLogState {
  /** Newest first. */
  entries: BridgeLogEntry[]
  record(entry: Omit<BridgeLogEntry, 'id'>): void
  clear(): void
}

let seq = 0

export const useBridgeLog = create<BridgeLogState>((set) => ({
  entries: [],
  record: (entry) => set((s) => ({ entries: [{ ...entry, id: ++seq }, ...s.entries].slice(0, BRIDGE_LOG_RING_SIZE) })),
  clear: () => set({ entries: [] }),
}))

export interface SeamOptions {
  /**
   * Background call (an effect, not a click). A seam that is still a stub resolves to `undefined` instead of
   * throwing. Every other failure is still thrown, so a caller that can fail for real should `.catch` it.
   */
  quiet?: boolean
}

/**
 * The only way app code calls into `pwa.*`. Wraps the call so every attempt lands in the bridge log
 * (Lab → Queue & Bridge), stubs are a normal state rather than a crash, and failures arrive as AppErrors.
 *
 *   await callSeam('badge.set', () => pwa.badge.set(3), { quiet: true })
 *
 * - ok: resolves with the value.
 * - not-implemented: logged, not reported; throws (or resolves `undefined` when `quiet`).
 * - any other failure: logged, reported to the error centre (silently when `quiet`), thrown as an AppError.
 */
export async function callSeam<T>(feature: string, fn: () => T | Promise<T>, options: SeamOptions & { quiet: true }): Promise<T | undefined>
export async function callSeam<T>(feature: string, fn: () => T | Promise<T>, options?: SeamOptions): Promise<T>
export async function callSeam<T>(feature: string, fn: () => T | Promise<T>, options: SeamOptions = {}): Promise<T | undefined> {
  const started = performance.now()
  const finish = (outcome: SeamOutcome, error?: AppError): void =>
    useBridgeLog.getState().record({ at: Date.now(), feature, outcome, durationMs: Math.round(performance.now() - started), error })

  try {
    const value = await fn()
    finish('ok')
    return value
  } catch (thrown) {
    const source = `seam:${feature}`
    // apiCall: a "x is not a function" from a browser API here means the browser lacks it.
    const error = toAppError(thrown, { source, feature, apiCall: true })
    if (error.kind === 'not-implemented') {
      finish('not-implemented', error)
      if (options.quiet) return undefined
      throw error
    }
    finish('error', error)
    errorCenter.report(error, { source, silent: options.quiet === true })
    throw error
  }
}
