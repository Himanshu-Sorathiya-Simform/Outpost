import type { SignalBoard, SignalReading } from '@shared/contracts'
import type { ResponseMeta, ResponseSource } from '@/lib/api/types'

export const POLL_MS = 5000
/** A sample older than this when it arrives was not produced for this request. */
export const STALE_AFTER_MS = 15_000
export const HISTORY_LEN = 30

/** Sources that mean something other than the relay answered this very request. */
const CACHED_SOURCES: ReadonlySet<ResponseSource> = new Set<ResponseSource>(['sw-cache', 'http-cache', 'sw-fallback'])

export interface Evidence {
  label: string
  value: string
  /** This line is part of why the sample is suspect. */
  tripped: boolean
}

export interface Suspicion {
  /** Every line of evidence, tripped or not, so the page shows what was compared. */
  evidence: Evidence[]
}

export const ageSeconds = (ms: number): number => Math.max(0, Math.floor(ms / 1000))

/** "4 s" under a minute, then the coarser forms from formatAge. */
export function sampleAgeText(ms: number): string {
  const s = ageSeconds(ms)
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`
}

/**
 * Is this response plausibly a fresh answer from the relay? `seq` advances on every real answer, and `sampledAt` is
 * stamped when the answer is built, so a repeated or falling seq, a sample that was already old on arrival, or a cache
 * source all say the same thing: something replayed a stored board. Returns null when nothing is off.
 */
export function assessSample(board: SignalBoard, meta: ResponseMeta | undefined, receivedAt: number, previousSeq: number | null): Suspicion | null {
  const sampled = Date.parse(board.sampledAt)
  const ageAtArrival = Number.isNaN(sampled) ? null : receivedAt - sampled
  const seqStuck = previousSeq !== null && board.seq <= previousSeq
  const tooOld = ageAtArrival !== null && ageAtArrival > STALE_AFTER_MS
  const source = meta?.source ?? 'unknown'
  const cached = CACHED_SOURCES.has(source)

  if (!seqStuck && !tooOld && !cached) return null
  return {
    evidence: [
      { label: 'Sequence', value: previousSeq === null ? `${board.seq} (first seen this session)` : `${board.seq}, previous ${previousSeq}`, tripped: seqStuck },
      { label: 'Age on arrival', value: ageAtArrival === null ? 'unreadable' : `${sampleAgeText(ageAtArrival)} against this device's clock, limit ${STALE_AFTER_MS / 1000} s`, tripped: tooOld },
      { label: 'Source', value: meta ? `${source} (${meta.sourceReason})` : source, tripped: cached },
    ],
  }
}

/** RSSI spans roughly -120 (floor) to -50 dBm (beside the mast). */
export const rssiPercent = (dbm: number): number => Math.round(Math.min(1, Math.max(0, (dbm + 120) / 70)) * 100)

export type Level = 'ok' | 'warn' | 'error'
export const rssiLevel = (dbm: number): Level => (dbm > -85 ? 'ok' : dbm > -100 ? 'warn' : 'error')
export const batteryLevel = (pct: number): Level => (pct > 50 ? 'ok' : pct > 25 ? 'warn' : 'error')

/** A dark station reports floor values, not measurements: show a dash, never the sentinel. */
export const hasCarrier = (r: SignalReading): boolean => r.status !== 'dark'
