import { z } from 'zod'
import { refCounted } from '@/lib/lifecycle'
import { createPersistedStore, safeLocal } from '@/lib/storage/safe'

export const THEMES = ['light', 'dark', 'system'] as const
export const DENSITIES = ['comfortable', 'compact'] as const

export const AppSettingsSchema = z.object({
  theme: z.enum(THEMES).catch('system'),
  density: z.enum(DENSITIES).catch('comfortable'),
})
export type AppSettingValues = z.infer<typeof AppSettingsSchema>
export type ResolvedTheme = 'light' | 'dark'

export const APP_SETTING_DEFAULTS: AppSettingValues = AppSettingsSchema.parse({})
export const APP_SETTINGS_KEY = 'outpost.settings.app'
/** Read by the inline script in index.html before first paint. Holds 'light' | 'dark'; absent means "follow the system". */
export const THEME_PREPAINT_KEY = 'outpost.theme'

/**
 * The browser chrome colour cannot be a CSS variable, so the two paper/night tokens from tokens.css are repeated
 * here. Keep in sync with the light paper and dark background colours there.
 */
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#ECE6D6', dark: '#12110D' }

export const useAppSettings = createPersistedStore<AppSettingValues>({ key: APP_SETTINGS_KEY, schema: AppSettingsSchema, defaults: APP_SETTING_DEFAULTS })

export function getAppSettings(): AppSettingValues {
  return useAppSettings.getState()
}

export function useAppSetting<K extends keyof AppSettingValues>(key: K): AppSettingValues[K] {
  return useAppSettings((s) => s[key])
}

const darkQuery = (): MediaQueryList | null => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null)

export function resolveTheme(theme: AppSettingValues['theme']): ResolvedTheme {
  if (theme !== 'system') return theme
  return darkQuery()?.matches ? 'dark' : 'light'
}

function applyAppearance(settings: AppSettingValues): void {
  const resolved = resolveTheme(settings.theme)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.dataset.density = settings.density
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved])
  if (settings.theme === 'system') safeLocal.remove(THEME_PREPAINT_KEY)
  else safeLocal.set(THEME_PREPAINT_KEY, settings.theme)
}

/**
 * Keeps <html data-theme data-density>, the theme-color meta and the pre-paint key in step with the store,
 * including when the OS flips between light and dark while the theme is 'system'. Idempotent.
 */
export const startAppearance = refCounted((): (() => void) => {
  const apply = (): void => applyAppearance(getAppSettings())
  apply()
  const unsubscribe = useAppSettings.subscribe(apply)
  const media = darkQuery()
  media?.addEventListener('change', apply)
  return () => {
    unsubscribe()
    media?.removeEventListener('change', apply)
  }
})
