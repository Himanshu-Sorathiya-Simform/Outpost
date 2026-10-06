import type { BenchStrategy } from '@shared/contracts'
import type { BenchReading } from './BenchStore'

export type ScenarioId = 'stale-after-bump' | 'server-down' | 'never-precached'

/** What a correctly written worker should give back for one strategy in one scenario. */
export interface Expectation {
  ok: boolean
  /** When ok: the verdict it should carry. Omitted means either is acceptable. */
  verdict?: 'fresh' | 'stale'
  /** AppError kinds that count as the expected failure when not ok. */
  errorKinds?: string[]
  text: string
}

export interface ScenarioDef {
  id: ScenarioId
  title: string
  /** What it does, in order. */
  summary: string
  /** Key fixed by the scenario; otherwise the run key is used. */
  fixedKey?: string
  expect: Record<BenchStrategy, Expectation>
}

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: 'stale-after-bump',
    title: 'Stale after bump',
    summary: 'Fetch all five to warm them, bump all five on the server, fetch all five again and judge each against the new revision.',
    expect: {
      'cache-first': { ok: true, verdict: 'stale', text: 'The warm copy again. Stale is the price of never asking.' },
      'network-first': { ok: true, verdict: 'fresh', text: 'The new revision, straight from the server.' },
      'stale-while-revalidate': { ok: true, verdict: 'stale', text: 'The warm copy now; the new one lands in the cache for the next reading.' },
      'network-only': { ok: true, verdict: 'fresh', text: 'The new revision, straight from the server.' },
      'cache-only': { ok: true, verdict: 'stale', text: 'The precached copy. Only a new install changes it.' },
    },
  },
  {
    id: 'server-down',
    title: 'Server down',
    summary: 'Fetch all five to warm them, switch the relay to hard down, fetch all five again, then clear all chaos whatever happens.',
    expect: {
      'cache-first': { ok: true, text: 'The warm copy. The network was never asked.' },
      'network-first': { ok: true, text: 'The warm copy, served as the fallback after the network failed.' },
      'stale-while-revalidate': { ok: true, text: 'The warm copy. The background request fails unseen.' },
      'network-only': { ok: false, errorKinds: ['network', 'offline', 'unavailable', 'timeout'], text: 'A network error, shown to the operator. There is nothing else it may do.' },
      'cache-only': { ok: true, text: 'The precached copy, if this key was precached. A cache-miss error otherwise.' },
    },
  },
  {
    id: 'never-precached',
    title: 'Never precached',
    summary: 'Fetch the delta key from all five. Nobody precaches delta, so cache-only has nothing to serve.',
    fixedKey: 'delta',
    expect: {
      'cache-first': { ok: true, text: 'A miss goes to the network and the answer is stored.' },
      'network-first': { ok: true, text: 'The network answers.' },
      'stale-while-revalidate': { ok: true, text: 'A miss waits for the network, same as cache-first.' },
      'network-only': { ok: true, text: 'The network answers.' },
      'cache-only': { ok: false, errorKinds: ['cache-miss'], text: 'A cache-miss error (504 with X-SW-Source: cache-miss). That is the route working, not a bug.' },
    },
  },
]

export function matchesExpectation(expect: Expectation, reading: BenchReading): boolean {
  if (!expect.ok) return !reading.outcome.ok && (expect.errorKinds === undefined || expect.errorKinds.includes(reading.outcome.error.kind))
  if (!reading.outcome.ok) return false
  if (expect.verdict === undefined) return true
  return reading.verdict.kind === expect.verdict
}
