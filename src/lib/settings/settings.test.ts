// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_SETTINGS_KEY, THEME_PREPAINT_KEY, resolveTheme, startAppearance, useAppSettings } from './app-settings'
import { LAB_SETTINGS_KEY, LAB_SETTING_DEFAULTS, LabSettingsSchema, useLabSettings } from './lab-settings'

beforeEach(() => {
  localStorage.clear()
  useAppSettings.getState().reset()
  useLabSettings.getState().reset()
})
afterEach(() => vi.unstubAllGlobals())

describe('lab settings', () => {
  it('defaults match the spec', () => {
    expect(LAB_SETTING_DEFAULTS).toEqual({
      staleTimeSec: 30,
      gcTimeMin: 1440,
      networkMode: 'offlineFirst',
      retries: 2,
      refetchOnFocus: true,
      persistQueryCache: false,
      rqBuster: 'version',
      requestTimeoutMs: 10_000,
      tabSync: true,
      showProvenance: true,
      probeIntervalSec: 15,
      deployWatchSec: 60,
    })
  })

  it('persists changes to localStorage', () => {
    useLabSettings.getState().set({ retries: 5, networkMode: 'online' })
    expect(JSON.parse(localStorage.getItem(LAB_SETTINGS_KEY) ?? '{}')).toMatchObject({ retries: 5, networkMode: 'online', staleTimeSec: 30 })
  })

  it('survives a reload: a fresh module instance reads what the last one wrote', async () => {
    useLabSettings.getState().set({ staleTimeSec: 120, persistQueryCache: true, rqBuster: 'build' })
    vi.resetModules()
    const fresh = await import('./lab-settings')
    expect(fresh.useLabSettings.getState()).toMatchObject({ staleTimeSec: 120, persistQueryCache: true, rqBuster: 'build' })
  })

  it('repairs invalid stored fields one at a time', () => {
    const parsed = LabSettingsSchema.parse({ staleTimeSec: -5, networkMode: 'sometimes', retries: 4, tabSync: 'yes', requestTimeoutMs: 1.5 })
    expect(parsed).toMatchObject({ staleTimeSec: 30, networkMode: 'offlineFirst', retries: 4, tabSync: true, requestTimeoutMs: 10_000 })
  })

  it('rehydrate() picks up a write made by another tab', () => {
    localStorage.setItem(LAB_SETTINGS_KEY, JSON.stringify({ probeIntervalSec: 0 }))
    useLabSettings.getState().rehydrate()
    expect(useLabSettings.getState().probeIntervalSec).toBe(0)
    expect(useLabSettings.getState().retries).toBe(2)
  })
})

describe('app settings and appearance', () => {
  it('persists theme and density', () => {
    useAppSettings.getState().set({ theme: 'dark', density: 'compact' })
    expect(JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) ?? '{}')).toEqual({ theme: 'dark', density: 'compact' })
  })

  it('applies data-theme, data-density, theme-color and the pre-paint key, and follows changes', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000">'
    const stop = startAppearance()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_PREPAINT_KEY)).toBeNull()

    useAppSettings.getState().set({ theme: 'dark', density: 'compact' })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.density).toBe('compact')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#12110D')
    expect(localStorage.getItem(THEME_PREPAINT_KEY)).toBe('dark')

    useAppSettings.getState().set({ theme: 'system' })
    expect(localStorage.getItem(THEME_PREPAINT_KEY)).toBeNull()
    stop()
    useAppSettings.getState().set({ theme: 'dark' })
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('resolves system from prefers-color-scheme', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }))
    expect(resolveTheme('system')).toBe('dark')
    expect(resolveTheme('light')).toBe('light')
  })
})
