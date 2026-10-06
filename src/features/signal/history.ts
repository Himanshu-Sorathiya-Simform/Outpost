import { create } from 'zustand'
import type { SignalBoard } from '@shared/contracts'
import type { ResponseMeta, ResponseSource } from '@/lib/api/types'
import { HISTORY_LEN, assessSample, hasCarrier, type Suspicion } from './signal'

export interface SignalSample {
  seq: number
  sampledAt: string
  /** Epoch ms the client received it: React Query's dataUpdatedAt, which identifies the sample. */
  receivedAt: number
  source: ResponseSource | 'unknown'
  suspicion: Suspicion | null
}

interface SignalSession {
  /** Oldest first, at most HISTORY_LEN. */
  samples: SignalSample[]
  /** Latency per station code, oldest first. NaN marks a sample where the station was dark. */
  latency: Record<string, number[]>
  record(board: SignalBoard, meta: ResponseMeta | undefined, receivedAt: number): void
  clear(): void
}

const tail = <T>(list: readonly T[], item: T): T[] => [...list, item].slice(-HISTORY_LEN)

/**
 * The board's memory for this session, in memory only. Survives leaving the page and coming back; a reload starts
 * it again. A sample that repeats an earlier seq is recorded (it is evidence) but adds nothing to the latency traces.
 */
export const useSignalSession = create<SignalSession>((set, get) => ({
  samples: [],
  latency: {},
  record(board, meta, receivedAt) {
    const { samples, latency } = get()
    const last = samples.at(-1)
    if (last?.receivedAt === receivedAt) return
    const previousSeq = last?.seq ?? null
    const fresh = previousSeq === null || board.seq > previousSeq
    const nextLatency = { ...latency }
    if (fresh) {
      for (const r of board.readings) nextLatency[r.stationCode] = tail(latency[r.stationCode] ?? [], hasCarrier(r) ? r.latencyMs : Number.NaN)
    }
    set({
      samples: tail(samples, { seq: board.seq, sampledAt: board.sampledAt, receivedAt, source: meta?.source ?? 'unknown', suspicion: assessSample(board, meta, receivedAt, previousSeq) }),
      latency: nextLatency,
    })
  },
  clear: () => set({ samples: [], latency: {} }),
}))
