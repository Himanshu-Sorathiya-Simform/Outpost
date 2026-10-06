import { useSyncExternalStore } from 'react'

/** Subscribes to one media query. Reading how the device is configured is capability detection, not PWA logic. */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onChange: () => void): (() => void) => {
    if (typeof matchMedia !== 'function') return () => undefined
    const list = matchMedia(query)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }
  return useSyncExternalStore(subscribe, () => typeof matchMedia === 'function' && matchMedia(query).matches, () => false)
}

export const DISPLAY_MODES = ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay', 'browser'] as const
export type DisplayMode = (typeof DISPLAY_MODES)[number]

/** The display mode the page is being shown in, as the `display-mode` media feature reports it. */
export function useDisplayMode(): DisplayMode {
  const standalone = useMediaQuery('(display-mode: standalone)')
  const minimal = useMediaQuery('(display-mode: minimal-ui)')
  const fullscreen = useMediaQuery('(display-mode: fullscreen)')
  const overlay = useMediaQuery('(display-mode: window-controls-overlay)')
  if (overlay) return 'window-controls-overlay'
  if (fullscreen) return 'fullscreen'
  if (standalone) return 'standalone'
  if (minimal) return 'minimal-ui'
  return 'browser'
}

export type BrowserFamily = 'chromium' | 'safari-ios' | 'safari-mac' | 'firefox'

/** Coarse guess from the user agent, good enough to pick which install instructions to highlight. */
export function detectBrowser(ua: string = navigator.userAgent): BrowserFamily {
  if (/iPhone|iPad|iPod/.test(ua)) return 'safari-ios'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'chromium'
  if (/Safari\//.test(ua)) return 'safari-mac'
  return 'chromium'
}
