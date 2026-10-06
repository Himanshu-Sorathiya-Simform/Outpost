import { AppError, callSeam, useBridgeLog, type SeamOutcome } from '@/lib'
import { pwa } from '@/pwa'

export interface ProbeResult {
  feature: string
  outcome: SeamOutcome
  /** What the seam returned, as JSON, when it returned anything. */
  value: string | null
  /** The error's kind and message when it failed for real. */
  error: string | null
}

interface Probe {
  feature: string
  run: () => unknown
}

/** The seams that read and change nothing. Probing them is safe at any time. */
const PROBES: readonly Probe[] = [
  { feature: 'notifications.permission', run: () => pwa.notifications.permission() },
  { feature: 'notifications.getSubscription', run: () => pwa.notifications.getSubscription() },
  { feature: 'sync.listQueued', run: () => pwa.sync.listQueued() },
  { feature: 'periodicSync.isSupported', run: () => pwa.periodicSync.isSupported() },
  { feature: 'periodicSync.list', run: () => pwa.periodicSync.list() },
  { feature: 'share.canShare', run: () => pwa.share.canShare({ url: location.href }) },
]

export const PROBE_COUNT = PROBES.length

const describe = (value: unknown): string | null => {
  if (value === undefined) return null
  try {
    return JSON.stringify(value) ?? null
  } catch {
    return String(value)
  }
}

/**
 * Calls every read-only seam once, quietly, so each one lands in the bridge log. The outcome is read back from the
 * log, because a quiet call to a stub resolves to undefined exactly like a method that returns nothing.
 */
export async function probeAllSeams(): Promise<ProbeResult[]> {
  const results: ProbeResult[] = []
  for (const probe of PROBES) {
    let value: unknown
    let error: string | null = null
    try {
      value = await callSeam(probe.feature, probe.run, { quiet: true })
    } catch (thrown) {
      error = AppError.is(thrown) ? `${thrown.kind}: ${thrown.message}` : String(thrown)
    }
    const logged = useBridgeLog.getState().entries.find((e) => e.feature === probe.feature)
    results.push({ feature: probe.feature, outcome: logged?.outcome ?? 'error', value: describe(value), error })
  }
  return results
}
