import { useCallback, useState } from 'react'
import { errorCenter, toAppError, useErrorCenter, type AppErrorKind } from '@/lib'
import { sleep } from './ErrorsScenarioHelpers'
import type { Landed, RunResult, Scenario, ScenarioAction } from './ErrorsScenarioTypes'

/** Long enough for an unhandled rejection, a React commit or a query's onError to reach the centre after the run ends. */
const SETTLE_MS = 450
const MAX_LANDED = 6

/** What the centre received since `before`: rows that are new, and rows whose duplicate counter grew. */
function diffCentre(before: ReadonlyMap<string, number>): Landed[] {
  const landed: Landed[] = []
  for (const record of useErrorCenter.getState().records) {
    const seen = before.get(record.id) ?? 0
    if (record.count <= seen) continue
    landed.push({ id: record.id, kind: record.error.kind, source: record.source, count: record.count - seen, userMessage: record.error.userMessage })
  }
  return landed.slice(0, MAX_LANDED)
}

export interface ScenarioRunner {
  results: Partial<Record<AppErrorKind, RunResult>>
  /** `kind:actionId` of the run in flight, or null. */
  running: string | null
  /** The render box has been told to throw. */
  crashed: boolean
  resetCrash(): void
  run(scenario: Scenario, action: ScenarioAction): Promise<void>
}

/**
 * Runs one scenario action at a time and reports what happened on both sides: what the caller saw (the thrown error)
 * and what the error centre received. Scenarios never file real failures themselves; only constructed errors are filed here.
 */
export function useScenarioRunner(): ScenarioRunner {
  const [results, setResults] = useState<Partial<Record<AppErrorKind, RunResult>>>({})
  const [running, setRunning] = useState<string | null>(null)
  const [crashed, setCrashed] = useState(false)

  const run = useCallback(async (scenario: Scenario, action: ScenarioAction): Promise<void> => {
    setRunning(`${scenario.kind}:${action.id}`)
    const before = new Map(useErrorCenter.getState().records.map((r) => [r.id, r.count]))
    let caught: AppErrorKind | null = null
    let note: string | null = null
    try {
      const outcome = await action.run({ crash: () => setCrashed(true) })
      note = outcome?.note ?? null
      if (outcome?.error) {
        caught = outcome.error.kind
        if (outcome.file) errorCenter.report(outcome.error, { source: outcome.error.context.source ?? 'lab:simulator', silent: true })
      }
    } catch (thrown) {
      caught = toAppError(thrown).kind
    }
    await sleep(SETTLE_MS)
    setResults((prev) => ({ ...prev, [scenario.kind]: { at: Date.now(), caught, note, landed: diffCentre(before) } }))
    setRunning(null)
  }, [])

  return { results, running, crashed, resetCrash: () => setCrashed(false), run }
}
