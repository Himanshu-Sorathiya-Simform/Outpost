import { create } from 'zustand'
import type { AppErrorKind } from '@/lib'
import type { ResponseSource } from '@/lib/api/types'
import type { ChaosKey } from './ChaosModel'

export const PROBE_RING = 200

export type ProbeOutcome =
  | { ok: true; status: number; source: ResponseSource; durationMs: number; chaos: string | null }
  | { ok: false; kind: AppErrorKind; status: number | null; durationMs: number; chaos: string | null; userMessage: string; message: string }

/** What the saved chaos state said would happen to this request when it was fired. */
export interface ProbePrediction {
  key: ChaosKey
  label: string
  /** Kinds that count as the expected symptom, including 'ok'. */
  expected: string[]
  /** Chance that the mode fires on a matching request (1 for the switches). Under 1, a clean answer is not a surprise. */
  chance: number
}

export interface ProbeAttempt {
  id: number
  at: number
  targetId: string
  targetLabel: string
  method: string
  path: string
  body: boolean
  predictions: ProbePrediction[]
  outcome: ProbeOutcome
}

interface ProbeState {
  attempts: ProbeAttempt[]
  running: number
  add(attempt: Omit<ProbeAttempt, 'id'>): void
  setRunning(delta: number): void
  clear(): void
}

let seq = 0

/** Lives in a module so the ledger and the "observed this session" ticks survive leaving the page and coming back. */
export const useProbeStore = create<ProbeState>((set) => ({
  attempts: [],
  running: 0,
  add: (attempt) => set((s) => ({ attempts: [{ ...attempt, id: ++seq }, ...s.attempts].slice(0, PROBE_RING) })),
  setRunning: (delta) => set((s) => ({ running: Math.max(0, s.running + delta) })),
  clear: () => set({ attempts: [] }),
}))

export const outcomeKey = (o: ProbeOutcome): string => (o.ok ? 'ok' : o.kind)

/** How many times a mode produced the symptom it should, and the last time. The basis of the tick in "Expected vs observed". */
export function observedCount(attempts: readonly ProbeAttempt[], key: ChaosKey): number {
  let n = 0
  for (const a of attempts) {
    const p = a.predictions.find((x) => x.key === key)
    if (p && p.expected.includes(outcomeKey(a.outcome))) n += 1
  }
  return n
}

export function tally(attempts: readonly ProbeAttempt[]): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>()
  for (const a of attempts) counts.set(outcomeKey(a.outcome), (counts.get(outcomeKey(a.outcome)) ?? 0) + 1)
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}
