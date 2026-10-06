import { useEffect } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { API, type BenchStrategy, type LabTruth, type RequestLogEntry } from '@shared/contracts'
import { AppError } from '@/lib/errors/app-error'
import { toAppError } from '@/lib/errors/normalize'
import { useLabFeedStore } from '@/lib/lab/feed'
import { benchQueryOptions, labTruthQueryOptions } from '@/lib/queries'
import { useBenchStore, type BenchReading, type SeenState, type Verdict } from './BenchStore'

/** How long after a fetch the server's log may still be catching up before we call it unseen. */
const SEEN_GRACE_MS = 3000
/** Client and server share a machine here, but a little slack keeps a skewed clock from hiding a real hit. */
const CLOCK_SLACK_MS = 1000

let nextId = 0
let nextBatch = 0

export function judge(rev: number | null, truthRev: number | null): Verdict {
  if (rev === null || truthRev === null) return { kind: 'unknown' }
  if (rev === truthRev) return { kind: 'fresh' }
  return rev < truthRev ? { kind: 'stale', by: truthRev - rev } : { kind: 'ahead', by: rev - truthRev }
}

export function verdictText(v: Verdict): string {
  switch (v.kind) {
    case 'fresh':
      return 'FRESH'
    case 'stale':
      return `STALE by ${v.by} ${v.by === 1 ? 'rev' : 'revs'}`
    case 'ahead':
      return `AHEAD of server by ${v.by}`
    case 'unknown':
      return 'NO VERDICT'
  }
}

export function truthRevOf(truth: LabTruth | undefined, strategy: BenchStrategy, key: string): number | null {
  return truth?.bench.find((b) => b.strategy === strategy && b.key === key)?.rev ?? null
}

/** The revision a reading carried, or null when it failed. */
export const readingRev = (r: BenchReading): number | null => (r.outcome.ok ? r.outcome.data.rev : null)

/** Finds the server's log line for this fetch: by request id when we have one, else by path and time (a request that died carries no id). */
function findLogEntry(reading: BenchReading, log: readonly RequestLogEntry[]): RequestLogEntry | undefined {
  const requestId = reading.outcome.ok ? reading.outcome.data.requestId : reading.outcome.error.context.requestId
  const since = reading.startedAt - CLOCK_SLACK_MS
  const path = API.bench(reading.strategy, reading.key)
  return log.find((e) => {
    if (Date.parse(e.ts) < since) return false
    return requestId ? e.requestId === requestId : e.method === 'GET' && e.path === path
  })
}

/** Settles `pending` readings against the server log. Call it whenever the log changes and on a timer. */
export function settleSeen(log: readonly RequestLogEntry[], now: number): void {
  const { readings, patch } = useBenchStore.getState()
  for (const list of Object.values(readings)) {
    for (const r of list) {
      if (r.seen !== 'pending') continue
      const entry = findLogEntry(r, log)
      if (entry) patch(r.id, r.strategy, { seen: 'seen', seenStatus: entry.status })
      else if (now - r.endedAt > SEEN_GRACE_MS) patch(r.id, r.strategy, { seen: 'unseen' })
    }
  }
}

/** Keeps the SERVER SAW IT column honest while a bench page is mounted. */
export function useSettleBenchSeen(): void {
  const log = useLabFeedStore((s) => s.serverLog)
  useEffect(() => {
    settleSeen(log, Date.now())
    const timer = setInterval(() => settleSeen(log, Date.now()), 1000)
    return () => clearInterval(timer)
  }, [log])
}

export const seenText = (seen: SeenState): string => (seen === 'seen' ? 'SERVER SAW IT' : seen === 'pending' ? 'CHECKING LOG' : 'NOT SEEN BY SERVER')

async function readTruth(qc: QueryClient): Promise<LabTruth | undefined> {
  try {
    const result = await qc.fetchQuery({ ...labTruthQueryOptions(), staleTime: 0, retry: false, networkMode: 'always' })
    return result.data
  } catch {
    // The verdict falls back to "no verdict"; the page's own truth poll reports the failure.
    return undefined
  }
}

/**
 * One fetch of /api/bench/:strategy/:key through the query layer, judged against what the server says right afterwards.
 * Failures become readings too: an AppError is an answer the bench wants to show, not something to throw.
 */
export async function takeReading(qc: QueryClient, strategy: BenchStrategy, key: string, batch: number | null = null): Promise<BenchReading> {
  const startedAt = Date.now()
  const t0 = performance.now()
  let outcome: BenchReading['outcome']
  try {
    const options = benchQueryOptions(strategy, key)
    const result = await qc.fetchQuery({ ...options, staleTime: 0, meta: { ...options.meta, silent: true } })
    outcome = { ok: true, data: result.data, meta: result.meta }
  } catch (thrown) {
    outcome = { ok: false, error: AppError.is(thrown) ? thrown : toAppError(thrown, { source: `bench:${strategy}` }) }
  }
  const durationMs = outcome.ok ? outcome.meta.durationMs : Math.round(performance.now() - t0)
  const endedAt = Date.now()
  const truthRev = truthRevOf(await readTruth(qc), strategy, key)

  const previous = useBenchStore.getState().readings[strategy].find((r) => r.key === key && r.outcome.ok)
  const hitsDelta = outcome.ok && previous?.outcome.ok ? outcome.data.hits - previous.outcome.data.hits : null
  const reading: BenchReading = {
    id: ++nextId,
    strategy,
    key,
    startedAt,
    endedAt,
    durationMs,
    outcome,
    truthRev,
    verdict: judge(outcome.ok ? outcome.data.rev : null, truthRev),
    seen: 'pending',
    seenStatus: null,
    hitsDelta,
    batch,
  }
  useBenchStore.getState().add(reading)
  settleSeen(useLabFeedStore.getState().serverLog, Date.now())
  return reading
}

/** One card's "Fetch": sets the busy flag around a single reading. */
export async function fetchOnce(qc: QueryClient, strategy: BenchStrategy, key: string): Promise<BenchReading> {
  useBenchStore.getState().setBusy(strategy, true)
  try {
    return await takeReading(qc, strategy, key)
  } finally {
    useBenchStore.getState().setBusy(strategy, false)
  }
}

/** Five requests in a row, each waiting for the last, so the per-call differences (cache warming up, revalidation landing) show. */
export async function fetchBatch(qc: QueryClient, strategy: BenchStrategy, key: string, count = 5): Promise<BenchReading[]> {
  const batch = ++nextBatch
  const out: BenchReading[] = []
  useBenchStore.getState().setBusy(strategy, true)
  try {
    for (let i = 0; i < count; i++) out.push(await takeReading(qc, strategy, key, batch))
    return out
  } finally {
    useBenchStore.getState().setBusy(strategy, false)
  }
}
