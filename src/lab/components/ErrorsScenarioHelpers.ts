import { API, type ChaosMode, type ChaosRule } from '@shared/contracts'
import { errorCenter, queryClient, toAppError, type AppErrorContext, type AppErrorKind } from '@/lib'
import { endpoints } from '@/lib/queries'
import type { Outcome } from './ErrorsScenarioTypes'

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Runs a request the way the app's own data layer does: through the query client, so QueryCache.onError
 * (not this file) is what files a failure in the centre. The entry stays under ['lab', 'sim', kind] for a minute,
 * which is also how it shows up in Lab, Query.
 */
export function probe<T>(kind: AppErrorKind, fn: () => Promise<T>): Promise<T> {
  return queryClient.fetchQuery({ queryKey: ['lab', 'sim', kind], queryFn: fn, retry: false, staleTime: 0, gcTime: 60_000 })
}

/** Every chaos-backed scenario aims at this route, so nothing else in the app is disturbed. */
export const CHAOS_TARGET = API.stations
const RULE_ID = 'lab-simulator'

type RulePatch = Partial<Omit<ChaosRule, 'id' | 'enabled'>> & { mode: ChaosMode }

async function disarm(): Promise<void> {
  const { data } = await endpoints.getLabState()
  await endpoints.putChaos({ ...data.chaos, rules: data.chaos.rules.filter((r) => r.id !== RULE_ID) })
}

/**
 * Puts a one-route chaos rule first in the relay's rule list, runs `fn`, and removes the rule again in `finally`.
 * The rule is found by id at removal time, so rules the learner changed in the meantime survive.
 */
export async function withChaosRule<T>(patch: RulePatch, fn: () => Promise<T>): Promise<T> {
  const rule: ChaosRule = {
    id: RULE_ID,
    label: `Simulator: ${patch.mode}`,
    enabled: true,
    method: 'ANY',
    pathPrefix: CHAOS_TARGET,
    latencyMs: 0,
    jitterMs: 0,
    probability: 1,
    status: 500,
    retryAfterSec: 0,
    ...patch,
  }
  const { data } = await endpoints.getLabState()
  await endpoints.putChaos({ ...data.chaos, rules: [rule, ...data.chaos.rules.filter((r) => r.id !== RULE_ID)] })
  try {
    return await fn()
  } finally {
    // A failed cleanup must not replace the error being thrown; it is loud in the centre instead.
    await disarm().catch((err: unknown) => errorCenter.report(err, { source: 'lab:simulator:cleanup' }))
  }
}

/** Evaluates `fn` while `navigator.onLine` reads false. Synchronous and restored at once; no events fire. */
export function asIfOffline<T>(fn: () => T): T {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
  try {
    return fn()
  } finally {
    Reflect.deleteProperty(navigator, 'onLine')
  }
}

/** The error a constructed scenario hands back: classified by the real normaliser, then filed by the simulator. */
export function synthetic(thrown: unknown, extra: AppErrorContext = {}): Outcome {
  return { error: toAppError(thrown, { source: 'lab:simulator', ...extra }), file: true }
}
