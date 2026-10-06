import { startSwMessageBridge } from './bridge'
import { installGlobalErrorHandlers } from './errors'
import { startNetMonitor, startResourceLog } from './net'
import { startQuerySettingsSync } from './query'
import { startAppearance } from './settings'
import { startTabSync } from './tabs'
import { startVersionWatcher } from './version'

export * from './api'
export * from './bridge'
export * from './errors'
export * from './lab'
export * from './net'
export * from './notify'
export * from './query'
export * from './settings'
export * from './storage'
export * from './tabs'
export * from './version'

export interface FoundationOptions {
  /** The router's navigate function; the service worker bridge uses it for `navigate` messages and push toasts. */
  navigate: (to: string) => void
}

/**
 * Starts every client-side observer and listener: global error handlers, theme effects, live query settings,
 * net monitor, resource log, tab sync, version watcher and the service worker message bridge.
 * Call once after the router exists (src/main.tsx). Returns a disposer that stops them all.
 */
export function startFoundation({ navigate }: FoundationOptions): () => void {
  const stops = [
    installGlobalErrorHandlers(),
    startAppearance(),
    startQuerySettingsSync(),
    startNetMonitor(),
    startResourceLog(),
    startTabSync(),
    startVersionWatcher(),
    startSwMessageBridge({ navigate }),
  ]
  return () => stops.reverse().forEach((stop) => stop())
}
