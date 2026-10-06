import type { ChaosRule, ChaosState } from '@shared/contracts'
import { apiFetch, getLabSettings, toAppError } from '@/lib'
import { matchRule, modeInfo } from './ChaosModel'
import { resolvePath, type ProbeTarget } from './ChaosProbeTargets'
import { useProbeStore, type ProbeAttempt, type ProbePrediction } from './ChaosProbeStore'

const PARALLEL = 4

/**
 * Latency is applied before any mode, so a give-up time shorter than the wait turns the expected answer into a timeout:
 * always, when it is shorter than the base latency, and sometimes when only the jitter pushes the wait past it.
 * `timeoutMs` 0 means never give up.
 */
function withTimeout(expected: string[], rule: ChaosRule, timeoutMs: number): string[] {
  if (timeoutMs <= 0 || expected.includes('timeout')) return expected
  if (timeoutMs < rule.latencyMs) return ['timeout']
  return timeoutMs < rule.latencyMs + rule.jitterMs ? [...expected, 'timeout'] : expected
}

/** What the saved chaos state says should happen to this request. Empty when nothing would touch it. */
export function predict(state: ChaosState | null, target: ProbeTarget, path: string, timeoutMs = 0): ProbePrediction[] {
  if (!state) return []
  const out: ProbePrediction[] = []
  const verdict = matchRule(state, target.method, path)
  if (verdict.kind === 'offline') {
    out.push({ key: 'server-offline', label: 'Server offline', expected: modeInfo('server-offline').expect(null), chance: 1 })
  } else if (verdict.kind === 'rule') {
    const info = modeInfo(verdict.rule.mode)
    if (!info.needsBody || target.body) out.push({ key: verdict.rule.mode, label: verdict.rule.label, expected: withTimeout(info.expect(verdict.rule), verdict.rule, timeoutMs), chance: verdict.rule.probability })
  }
  const drifts = path.startsWith('/api/dispatches') || path.startsWith('/api/digest')
  if (state.schemaDrift && target.body && drifts) out.push({ key: 'schema-drift', label: 'Schema drift', expected: ['schema-mismatch'], chance: 1 })
  return out
}

export interface ProbeRun {
  target: ProbeTarget
  count: number
  /** undefined: the lab setting requestTimeoutMs. */
  timeoutMs: number | undefined
  assetPath: string | null
  state: ChaosState | null
  signal: AbortSignal
}

async function once(run: ProbeRun, path: string): Promise<void> {
  const { target } = run
  const timeoutMs = run.timeoutMs ?? getLabSettings().requestTimeoutMs
  const predictions = predict(run.state, target, path, timeoutMs)
  const at = Date.now()
  const started = performance.now()
  const base = { at, targetId: target.id, targetLabel: target.label, method: target.method, path, body: target.body, predictions }
  let attempt: Omit<ProbeAttempt, 'id'>
  try {
    const { meta } = await apiFetch({ method: target.method, path, schema: target.schema, allowEmpty: target.allowEmpty, timeoutMs, cache: target.cache, signal: run.signal })
    attempt = { ...base, outcome: { ok: true, status: meta.status, source: meta.source, durationMs: meta.durationMs, chaos: meta.chaos } }
  } catch (thrown) {
    const error = toAppError(thrown, { url: path, method: target.method })
    if (run.signal.aborted && error.kind === 'aborted') return
    attempt = {
      ...base,
      outcome: {
        ok: false,
        kind: error.kind,
        status: error.context.status ?? null,
        durationMs: Math.round(performance.now() - started),
        chaos: error.context.chaos ?? null,
        userMessage: error.userMessage,
        message: error.message,
      },
    }
  }
  useProbeStore.getState().add(attempt)
}

/** Fires `count` requests, four at a time, each recorded in the ledger as it finishes. Resolves when all are done or the run is aborted. */
export async function fireProbe(run: ProbeRun): Promise<void> {
  const path = resolvePath(run.target, run.assetPath)
  const store = useProbeStore.getState()
  store.setRunning(run.count)
  let remaining = run.count
  const worker = async (): Promise<void> => {
    while (remaining > 0 && !run.signal.aborted) {
      remaining -= 1
      try {
        await once(run, path)
      } finally {
        useProbeStore.getState().setRunning(-1)
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL, run.count) }, worker))
  } finally {
    // Attempts that were never started because the run was stopped.
    useProbeStore.getState().setRunning(-remaining)
  }
}
