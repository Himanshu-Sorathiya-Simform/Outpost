/**
 * Mutable, process-wide lab state shared by every server module (store, routes, chaos, lab, push).
 * Nothing else is global. `resetRuntime()` is called by POST /api/_lab/reset.
 */
import type { ChaosState, HeaderProfile, WireState } from '../shared/contracts'

export function defaultChaos(): ChaosState {
  // Chaos agent (server/chaos.ts) replaces `rules` with its named default rule set (all disabled) on import/reset.
  return { serverOffline: false, schemaDrift: false, rules: [] }
}
export function defaultWire(): WireState {
  return { auto: false, everySec: 20, pushOnNew: false }
}

export const runtime = {
  chaos: defaultChaos(),
  wire: defaultWire(),
  headerProfile: 'realistic' as HeaderProfile,
  counters: { requests: 0, chaosInjected: 0, pushSent: 0 },
  /** Filled in by the chaos module so resetRuntime can restore the named default rules. */
  defaultRules: (() => []) as () => ChaosState['rules'],
}

export function resetRuntime(): void {
  runtime.chaos = { ...defaultChaos(), rules: runtime.defaultRules() }
  runtime.wire = defaultWire()
  runtime.headerProfile = 'realistic'
  runtime.counters = { requests: 0, chaosInjected: 0, pushSent: 0 }
}
