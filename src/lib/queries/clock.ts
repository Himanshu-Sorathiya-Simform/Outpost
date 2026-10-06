import { useSyncExternalStore } from 'react'

/**
 * A once-a-second wall clock for countdowns. A shared store rather than state in each component: there is one
 * timer however many countdowns are mounted, it only runs while somebody is subscribed, and nothing reads
 * Date.now() during render.
 */
let now = Date.now()
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (timer === null) {
    // The last reading may be hours old if nobody was subscribed.
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      listeners.forEach((l) => l())
    }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

/** Epoch ms, refreshed every second while the calling component is mounted. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now)
}
