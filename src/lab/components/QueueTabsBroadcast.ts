import { broadcastInvalidate, getTabId, TAB_CHANNEL } from '@/lib'
import { qk } from '@/lib/queries'

/** The key the test broadcast invalidates: every dispatch feed and detail. Visible in the network log of each tab that hears it. */
export const TEST_INVALIDATE_KEY = qk.dispatches()

/** Asks every other tab to refetch the dispatches. Does nothing when the lab setting `tabSync` is off. */
export function sendTestInvalidate(): void {
  broadcastInvalidate(TEST_INVALIDATE_KEY)
}

/**
 * Posts `settings-changed` on the tab channel exactly as the settings stores do, so every other tab re-reads its
 * settings from storage. The tab module only sends this from a store change; there is no exported function for it.
 * Returns false when the browser has no BroadcastChannel (the module then falls back to storage events, which a
 * test message cannot imitate).
 */
export function sendSettingsChanged(scope: 'app' | 'lab'): boolean {
  if (typeof BroadcastChannel !== 'function') return false
  const channel = new BroadcastChannel(TAB_CHANNEL)
  try {
    channel.postMessage({ from: getTabId(), msg: { type: 'settings-changed', scope } })
  } finally {
    channel.close()
  }
  return true
}
