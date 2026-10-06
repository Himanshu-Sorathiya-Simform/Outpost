import { create } from 'zustand'
import { BENCH_STRATEGIES, type BenchResponse, type BenchStrategy } from '@shared/contracts'
import type { ResponseMeta } from '@/lib/api/types'
import type { AppError } from '@/lib/errors/app-error'

export const HISTORY_SIZE = 15

export type Verdict = { kind: 'fresh' } | { kind: 'stale'; by: number } | { kind: 'ahead'; by: number } | { kind: 'unknown' }

/** Whether the server's own request log contains this fetch. `pending` lasts a few seconds, while the SSE feed catches up. */
export type SeenState = 'pending' | 'seen' | 'unseen'

export type ReadingOutcome = { ok: true; data: BenchResponse; meta: ResponseMeta } | { ok: false; error: AppError }

export interface BenchReading {
  id: number
  strategy: BenchStrategy
  key: string
  /** Epoch ms when the request started and when it settled, by the page's own clock. */
  startedAt: number
  endedAt: number
  durationMs: number
  outcome: ReadingOutcome
  /** The server's revision for this strategy and key right after the reading, or null when the truth could not be read. */
  truthRev: number | null
  verdict: Verdict
  seen: SeenState
  /** Status the server logged for it, when the server saw it. */
  seenStatus: number | null
  /** Server hits compared with the previous reading of the same key. null for the first one or after an error. */
  hitsDelta: number | null
  /** Shared by the readings of one "Fetch x5", otherwise null. */
  batch: number | null
}

type Readings = Record<BenchStrategy, BenchReading[]>

interface BenchStoreState {
  /** Newest first, at most HISTORY_SIZE per strategy. */
  readings: Readings
  /** A card is mid-request. */
  busy: Record<BenchStrategy, boolean>
  add(reading: BenchReading): void
  patch(id: number, strategy: BenchStrategy, patch: Partial<Pick<BenchReading, 'seen' | 'seenStatus'>>): void
  setBusy(strategy: BenchStrategy, busy: boolean): void
  clear(strategy: BenchStrategy): void
}

const perStrategy = <T,>(make: () => T): Record<BenchStrategy, T> =>
  Object.fromEntries(BENCH_STRATEGIES.map((s) => [s, make()])) as Record<BenchStrategy, T>

export const useBenchStore = create<BenchStoreState>((set) => ({
  readings: perStrategy<BenchReading[]>(() => []),
  busy: perStrategy(() => false),
  add: (reading) =>
    set((s) => ({ readings: { ...s.readings, [reading.strategy]: [reading, ...s.readings[reading.strategy]].slice(0, HISTORY_SIZE) } })),
  patch: (id, strategy, patch) =>
    set((s) => ({ readings: { ...s.readings, [strategy]: s.readings[strategy].map((r) => (r.id === id ? { ...r, ...patch } : r)) } })),
  setBusy: (strategy, busy) => set((s) => ({ busy: { ...s.busy, [strategy]: busy } })),
  clear: (strategy) => set((s) => ({ readings: { ...s.readings, [strategy]: [] } })),
}))

/**
 * Race and scenario results hold the reading as it was when it landed; the SERVER SAW IT check settles afterwards in
 * the store. This returns a resolver that swaps a held reading for its current version (or keeps it if it aged out).
 */
export function useCurrentReading(): (reading: BenchReading | undefined) => BenchReading | undefined {
  const readings = useBenchStore((s) => s.readings)
  return (reading) => (reading ? (readings[reading.strategy].find((r) => r.id === reading.id) ?? reading) : undefined)
}
