import { create } from 'zustand'
import { notify } from '@/lib/notify'
import { APP_ERROR_KINDS, type AppError, type AppErrorKind } from './app-error'
import { toAppError } from './normalize'

export const ERROR_RING_SIZE = 200

/** One row in the error centre. Identical errors arriving back to back share a row and bump `count`. */
export interface ErrorRecord {
  /** Id of the first AppError in the run. Stable while the run keeps growing. */
  id: string
  /** The most recent occurrence. */
  error: AppError
  count: number
  firstAt: number
  lastAt: number
  source: string | null
}

export interface ReportOptions {
  /** Where it came from: 'query:<hash>', 'seam:badge.set', 'window.onerror', ... Falls back to `error.context.source`. */
  source?: string
  /** Record it, but do not raise a toast (the screen already shows the failure in place). */
  silent?: boolean
}

interface ErrorCenterState {
  /** Newest first, at most ERROR_RING_SIZE rows. */
  records: ErrorRecord[]
  /** Occurrences per kind since the last clear(). Counts keep growing after old rows fall off the ring. */
  counts: Record<AppErrorKind, number>
  report(err: unknown, options?: ReportOptions): AppError
  clear(): void
}

/** Expected states that are recorded for the learner but never interrupt them with a toast. */
const NEVER_TOAST: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>(['aborted', 'not-implemented'])

const emptyCounts = (): Record<AppErrorKind, number> => Object.fromEntries(APP_ERROR_KINDS.map((k) => [k, 0])) as Record<AppErrorKind, number>

/** Two errors collapse when everything a human would compare is equal. */
function signature(error: AppError, source: string | null): string {
  const { url, status, code } = error.context
  return [error.kind, error.message, source, url, status, code].join('|')
}

export const useErrorCenter = create<ErrorCenterState>((set, get) => ({
  records: [],
  counts: emptyCounts(),
  report(err, options = {}) {
    const error = toAppError(err, options.source ? { source: options.source } : undefined)
    const source = options.source ?? error.context.source ?? null
    const now = Date.now()
    const { records, counts } = get()
    const latest = records[0]

    const next: ErrorRecord[] =
      latest && signature(latest.error, latest.source) === signature(error, source)
        ? [{ ...latest, error, count: latest.count + 1, lastAt: now }, ...records.slice(1)]
        : [{ id: error.id, error, count: 1, firstAt: now, lastAt: now, source }, ...records].slice(0, ERROR_RING_SIZE)

    set({ records: next, counts: { ...counts, [error.kind]: counts[error.kind] + 1 } })

    if (!options.silent && !NEVER_TOAST.has(error.kind)) {
      // One toast slot per kind, so a burst of identical failures replaces rather than stacks.
      notify({ tone: 'error', title: error.userMessage, key: `error:${error.kind}` })
    }
    return error
  },
  clear: () => set({ records: [], counts: emptyCounts() }),
}))

/** Non-React entry point: `errorCenter.report(err, { source })`. */
export const errorCenter = {
  report: (err: unknown, options?: ReportOptions): AppError => useErrorCenter.getState().report(err, options),
  clear: (): void => useErrorCenter.getState().clear(),
}

export const useErrorRecords = (): ErrorRecord[] => useErrorCenter((s) => s.records)
export const useErrorCounts = (): Record<AppErrorKind, number> => useErrorCenter((s) => s.counts)
