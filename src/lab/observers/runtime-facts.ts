import { useEffect, useState, useSyncExternalStore } from 'react'

export type DisplayMode = 'window-controls-overlay' | 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser'

/** In the order the browser resolves them: the most specific installed mode wins, 'browser' is the fallthrough. */
export const DISPLAY_MODES: readonly DisplayMode[] = ['window-controls-overlay', 'fullscreen', 'standalone', 'minimal-ui', 'browser']

const query = (mode: DisplayMode): MediaQueryList | null => (typeof matchMedia === 'function' ? matchMedia(`(display-mode: ${mode})`) : null)

export function readDisplayMode(): DisplayMode {
  return DISPLAY_MODES.find((mode) => query(mode)?.matches === true) ?? 'browser'
}

export const displayModeMatches = (mode: DisplayMode): boolean => query(mode)?.matches === true

function subscribeDisplayMode(onChange: () => void): () => void {
  const lists = DISPLAY_MODES.map(query).filter((q): q is MediaQueryList => q !== null)
  lists.forEach((q) => q.addEventListener('change', onChange))
  return () => lists.forEach((q) => q.removeEventListener('change', onChange))
}

/** The display-mode media feature, live: it changes when an installed window is toggled to fullscreen, for one. */
export const useDisplayMode = (): DisplayMode => useSyncExternalStore(subscribeDisplayMode, readDisplayMode, () => 'browser')

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** navigator.onLine. It only knows about the network interface, not about the internet. */
export const useBrowserOnline = (): boolean => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)

export interface ConnectionFacts {
  effectiveType: string | null
  downlinkMbps: number | null
  rttMs: number | null
  saveData: boolean | null
  type: string | null
}

interface ConnectionLike extends EventTarget {
  effectiveType?: unknown
  downlink?: unknown
  rtt?: unknown
  saveData?: unknown
  type?: unknown
}

const isConnection = (value: unknown): value is ConnectionLike => typeof value === 'object' && value !== null && 'addEventListener' in value

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function readConnection(): ConnectionFacts | null {
  const conn: unknown = Reflect.get(navigator, 'connection')
  if (!isConnection(conn)) return null
  return { effectiveType: str(conn.effectiveType), downlinkMbps: num(conn.downlink), rttMs: num(conn.rtt), saveData: typeof conn.saveData === 'boolean' ? conn.saveData : null, type: str(conn.type) }
}

/** navigator.connection values, re-read on its change event. `null` when the browser has no such object. */
export function useConnection(): ConnectionFacts | null {
  const [facts, setFacts] = useState<ConnectionFacts | null>(readConnection)
  useEffect(() => {
    const conn: unknown = Reflect.get(navigator, 'connection')
    if (!isConnection(conn)) return
    const onChange = (): void => setFacts(readConnection())
    conn.addEventListener('change', onChange)
    return () => conn.removeEventListener('change', onChange)
  }, [])
  return facts
}

export interface StaticFacts {
  secureContext: boolean
  origin: string
  protocol: string
  language: string
  languages: string[]
  userAgent: string
  cores: number | null
  memoryGb: number | null
  cookiesEnabled: boolean
  /** Names of the cookies script can see. HttpOnly cookies, such as the session, are not among them. */
  visibleCookies: string[]
  iosStandalone: boolean | null
}

export function readStaticFacts(): StaticFacts {
  const memory: unknown = Reflect.get(navigator, 'deviceMemory')
  const standalone: unknown = Reflect.get(navigator, 'standalone')
  return {
    secureContext: typeof isSecureContext === 'boolean' ? isSecureContext : false,
    origin: location.origin,
    protocol: location.protocol,
    language: navigator.language,
    languages: [...navigator.languages],
    userAgent: navigator.userAgent,
    cores: num(navigator.hardwareConcurrency),
    memoryGb: num(memory),
    cookiesEnabled: navigator.cookieEnabled,
    visibleCookies: document.cookie
      .split(';')
      .map((c) => c.split('=')[0]?.trim() ?? '')
      .filter(Boolean),
    iosStandalone: typeof standalone === 'boolean' ? standalone : null,
  }
}
