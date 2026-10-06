import { useSyncExternalStore } from 'react'

/**
 * A shared wall clock for components that show "3 min ago". It is an external store so render
 * stays pure: the timestamp is refreshed on subscribe and on an interval, never read in render.
 */
let now = 0
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function tick(): void {
  now = Date.now()
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  tick()
  timer ??= setInterval(tick, 1000)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

const getSnapshot = (): number => now
const getServerSnapshot = (): number => 0

/** Current time in ms, re-rendered about once a second while any consumer is mounted. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
