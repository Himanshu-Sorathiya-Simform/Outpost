import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { POLL_MS } from './signal'

const subscribeVisibility = (onChange: () => void): (() => void) => {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}
const isVisible = (): boolean => document.visibilityState !== 'hidden'

export interface BoardPolling {
  paused: boolean
  visible: boolean
  /** 0 switches polling off. */
  pollMs: number
  toggle: () => void
}

/** Polling is on while the tab is visible and the operator has not paused it. The query refuses to poll in a hidden tab as well. */
export function useBoardPolling(): BoardPolling {
  const [paused, setPaused] = useState(false)
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, () => true)
  return { paused, visible, pollMs: visible && !paused ? POLL_MS : 0, toggle: () => setPaused((p) => !p) }
}

/** Asks for a fresh board the moment polling switches back on (resume, or the tab coming back into view). */
export function useResampleOnResume(active: boolean, resample: () => void): void {
  const was = useRef(active)
  useEffect(() => {
    if (active && !was.current) resample()
    was.current = active
  }, [active, resample])
}
