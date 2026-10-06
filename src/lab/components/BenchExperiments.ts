import type { QueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { BENCH_STRATEGIES, type BenchStrategy } from '@shared/contracts'
import { safeLocal } from '@/lib/storage'
import { probeNow } from '@/lib/net'
import type { AppError } from '@/lib/errors/app-error'
import { toAppError } from '@/lib/errors/normalize'
import { endpoints, qk } from '@/lib/queries'
import { takeReading } from './BenchRun'
import { SCENARIOS, type ScenarioId } from './BenchScenarioDefs'
import type { BenchReading } from './BenchStore'

type Readings = Partial<Record<BenchStrategy, BenchReading>>

export interface RaceState {
  status: 'idle' | 'running' | 'done'
  key: string | null
  current: BenchStrategy | null
  rows: Readings
}

export interface ScenarioState {
  status: 'idle' | 'running' | 'done' | 'failed'
  id: ScenarioId | null
  key: string | null
  /** Plain-language progress, oldest first. Read out by a live region. */
  log: string[]
  results: Readings
  /** `n/a` when the scenario never touched chaos. */
  chaos: 'n/a' | 'restored' | 'not-restored'
  failure: AppError | null
  chaosFailure: AppError | null
}

interface ExperimentState {
  race: RaceState
  scenario: ScenarioState
}

const idleRace: RaceState = { status: 'idle', key: null, current: null, rows: {} }
const idleScenario: ScenarioState = { status: 'idle', id: null, key: null, log: [], results: {}, chaos: 'n/a', failure: null, chaosFailure: null }

export const useBenchExperiments = create<ExperimentState>(() => ({ race: idleRace, scenario: idleScenario }))

const setRace = (patch: Partial<RaceState>): void => useBenchExperiments.setState((s) => ({ race: { ...s.race, ...patch } }))
const setScenario = (patch: Partial<ScenarioState>): void => useBenchExperiments.setState((s) => ({ scenario: { ...s.scenario, ...patch } }))
const logStep = (line: string): void => useBenchExperiments.setState((s) => ({ scenario: { ...s.scenario, log: [...s.scenario.log, line] } }))

/** True while a race or a scenario owns the bench: the cards stop accepting clicks so nothing interleaves with it. */
export const useBenchLocked = (): boolean => useBenchExperiments((s) => s.race.status === 'running' || s.scenario.status === 'running')

const isLocked = (): boolean => {
  const { race, scenario } = useBenchExperiments.getState()
  return race.status === 'running' || scenario.status === 'running'
}

/** The same key through each strategy in turn. Rows fill in as the readings land. */
export async function runRace(qc: QueryClient, key: string): Promise<void> {
  if (isLocked()) return
  useBenchExperiments.setState({ race: { status: 'running', key, current: null, rows: {} } })
  try {
    for (const strategy of BENCH_STRATEGIES) {
      setRace({ current: strategy })
      const reading = await takeReading(qc, strategy, key)
      useBenchExperiments.setState((s) => ({ race: { ...s.race, rows: { ...s.race.rows, [strategy]: reading } } }))
    }
  } finally {
    setRace({ status: 'done', current: null })
  }
}

async function sweep(qc: QueryClient, key: string, record = false): Promise<void> {
  for (const strategy of BENCH_STRATEGIES) {
    const reading = await takeReading(qc, strategy, key)
    if (record) useBenchExperiments.setState((s) => ({ scenario: { ...s.scenario, results: { ...s.scenario.results, [strategy]: reading } } }))
  }
}

async function bumpAll(qc: QueryClient, key: string): Promise<void> {
  for (const strategy of BENCH_STRATEGIES) await endpoints.bumpBench(strategy, key)
  await qc.invalidateQueries({ queryKey: qk.lab.truth() })
}

/** Set while a scenario holds the relay hard down. A reload skips the scenario's `finally`, so the next Bench mount reads this and clears chaos. */
const ARMED_KEY = 'outpost.lab.bench-armed-chaos'

async function hardDown(qc: QueryClient): Promise<void> {
  safeLocal.set(ARMED_KEY, '1')
  const { data } = await endpoints.getLabState()
  await endpoints.putChaos({ ...data.chaos, serverOffline: true })
  void qc.invalidateQueries({ queryKey: qk.lab.state() })
}

async function clearChaos(qc: QueryClient): Promise<void> {
  await endpoints.applyChaosPreset('all-clear')
  safeLocal.remove(ARMED_KEY)
  void qc.invalidateQueries({ queryKey: qk.lab.state() })
  void probeNow()
}

/** Call when the Bench mounts: a scenario that was cut short by a reload left the relay hard down, so put it back. Returns whether it did. */
export async function restoreAbandonedBench(qc: QueryClient): Promise<boolean> {
  if (safeLocal.get(ARMED_KEY) === null || isLocked()) return false
  try {
    await clearChaos(qc)
    return true
  } catch {
    // Still unreachable or refused: the flag stays, and the next mount tries again.
    return false
  }
}

/**
 * Runs one guided experiment. Whatever happens in the middle, a scenario that switched chaos on switches all of it
 * off again before it reports, and says so if it could not.
 */
export async function runScenario(qc: QueryClient, id: ScenarioId, runKey: string): Promise<void> {
  if (isLocked()) return
  const def = SCENARIOS.find((s) => s.id === id)
  if (!def) return
  const key = def.fixedKey ?? runKey
  useBenchExperiments.setState({ scenario: { ...idleScenario, status: 'running', id, key } })
  let touchedChaos = false
  try {
    if (id === 'stale-after-bump') {
      logStep(`Fetching all five on ${key} to warm them.`)
      await sweep(qc, key)
      logStep('Bumping the revision of all five on the server.')
      await bumpAll(qc, key)
      logStep('Fetching all five again.')
      await sweep(qc, key, true)
    } else if (id === 'server-down') {
      logStep(`Fetching all five on ${key} to warm them.`)
      await sweep(qc, key)
      logStep('Switching the relay to hard down.')
      touchedChaos = true
      await hardDown(qc)
      logStep('Fetching all five with the server gone.')
      await sweep(qc, key, true)
    } else {
      logStep(`Fetching all five on ${key}, which nobody precaches.`)
      await sweep(qc, key, true)
    }
    setScenario({ status: 'done' })
  } catch (thrown) {
    setScenario({ status: 'failed', failure: toAppError(thrown, { source: `bench:scenario:${id}` }) })
  } finally {
    if (touchedChaos) {
      logStep('Clearing all chaos.')
      try {
        await clearChaos(qc)
        setScenario({ chaos: 'restored' })
        logStep('Chaos cleared.')
      } catch (thrown) {
        setScenario({ chaos: 'not-restored', chaosFailure: toAppError(thrown, { source: 'bench:scenario:restore' }) })
      }
    }
  }
}
