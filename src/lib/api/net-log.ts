import { create } from 'zustand'
import type { AppErrorKind } from '@/lib/errors/app-error'
import type { ResponseSource } from './types'

export const NET_LOG_RING_SIZE = 300

/** One apiFetch call, successful or not. */
export interface NetLogEntry {
  id: number
  /** Epoch ms when the request started. */
  startedAt: number
  method: string
  /** Path + query, as requested. */
  url: string
  /** HTTP status; 0 when no response arrived (offline, timeout, abort, dropped socket). */
  status: number
  durationMs: number
  /** Where the response came from. null when there was no response to judge. */
  source: ResponseSource | null
  errorKind: AppErrorKind | null
  requestId: string | null
  chaos: string | null
  bytes: number | null
}

export type NetLogInput = Omit<NetLogEntry, 'id'>

interface NetLogState {
  /** Newest first. */
  entries: NetLogEntry[]
  record(entry: NetLogInput): void
  clear(): void
}

let seq = 0

export const useNetLog = create<NetLogState>((set) => ({
  entries: [],
  record: (entry) => set((s) => ({ entries: [{ ...entry, id: ++seq }, ...s.entries].slice(0, NET_LOG_RING_SIZE) })),
  clear: () => set({ entries: [] }),
}))
