import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { useNetLog } from '@/lib/api/net-log'
import { useNetStatus } from '@/lib/net'

/**
 * When the relay last answered, on this device's clock: the last probe or the last API response that was not a
 * failure, whichever is later. The net monitor keeps only the last probe, successful or not, so the shell remembers
 * the last one that got through. `null` until the first success of this page load.
 */
export const useLastContact = create<{ at: number | null }>(() => ({ at: null }))

const markContact = (at: number = Date.now()): void => useLastContact.setState((prev) => (prev.at !== null && prev.at >= at ? prev : { at }))

/** Feeds useLastContact from the net status and the API log. Mount once in the shell; returns a disposer. */
export function trackLastContact(): () => void {
  if (useNetStatus.getState().server === 'reachable') markContact()
  const stopStatus = useNetStatus.subscribe((s, prev) => {
    if (s.server === 'reachable' && (prev.server !== 'reachable' || s.lastProbeAt !== prev.lastProbeAt)) markContact()
  })
  // Every answered request counts, so the banner never claims an older "last contact" than a board it is sitting above.
  const stopLog = useNetLog.subscribe((s, prev) => {
    const latest = s.entries[0]
    if (latest && latest !== prev.entries[0] && latest.errorKind === null && latest.status >= 200 && latest.status < 400) markContact(latest.startedAt + latest.durationMs)
  })
  return () => {
    stopStatus()
    stopLog()
  }
}

const subscribeController = (onChange: () => void): (() => void) => {
  const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
  container?.addEventListener('controllerchange', onChange)
  return () => container?.removeEventListener('controllerchange', onChange)
}

const getControlled = (): boolean => typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller)

/** Read-only: is a service worker controlling this page right now? Always false without a worker. */
export function useSwControlled(): boolean {
  return useSyncExternalStore(subscribeController, getControlled, () => false)
}
