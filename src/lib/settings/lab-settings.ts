import { z } from 'zod'
import { createPersistedStore } from '@/lib/storage/safe'

export const NETWORK_MODES = ['online', 'always', 'offlineFirst'] as const
export const RQ_BUSTERS = ['version', 'build', 'none'] as const

const int = (min: number, max: number, fallback: number) => z.number().int().min(min).max(max).catch(fallback)

/**
 * Knobs for the instruments. Every field falls back to its default on its own, so a value written by an older
 * build (or hand-edited in DevTools) never takes the rest of the settings down with it.
 */
export const LabSettingsSchema = z.object({
  /** React Query: how long fetched data counts as fresh. */
  staleTimeSec: int(0, 86_400, 30),
  /** React Query: how long unused data stays in memory. Keep >= the persister's 24 h maxAge or persistence is pointless. */
  gcTimeMin: int(0, 10_080, 1440),
  networkMode: z.enum(NETWORK_MODES).catch('offlineFirst'),
  retries: int(0, 10, 2),
  refetchOnFocus: z.boolean().catch(true),
  /** Applies on next reload: hydration happens once, before the first render. */
  persistQueryCache: z.boolean().catch(false),
  rqBuster: z.enum(RQ_BUSTERS).catch('version'),
  requestTimeoutMs: int(0, 120_000, 10_000),
  tabSync: z.boolean().catch(true),
  showProvenance: z.boolean().catch(true),
  /** 0 disables the interval; event-driven probes still run. */
  probeIntervalSec: int(0, 3600, 15),
  /** 0 disables polling; focus and reconnect checks still run. */
  deployWatchSec: int(0, 3600, 60),
})
export type LabSettingValues = z.infer<typeof LabSettingsSchema>
export type NetworkMode = LabSettingValues['networkMode']
export type RqBuster = LabSettingValues['rqBuster']

export const LAB_SETTING_DEFAULTS: LabSettingValues = LabSettingsSchema.parse({})
export const LAB_SETTINGS_KEY = 'outpost.settings.lab'

export const useLabSettings = createPersistedStore<LabSettingValues>({ key: LAB_SETTINGS_KEY, schema: LabSettingsSchema, defaults: LAB_SETTING_DEFAULTS })

/** Current values, for non-React code (apiFetch, timers, query client callbacks). */
export function getLabSettings(): LabSettingValues {
  return useLabSettings.getState()
}

/** Typed single-value selector: `const timeout = useLabSetting('requestTimeoutMs')`. */
export function useLabSetting<K extends keyof LabSettingValues>(key: K): LabSettingValues[K] {
  return useLabSettings((s) => s[key])
}
