import { useSyncExternalStore } from 'react'

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

/** Client wall clock in ms, re-read every second while a component is subscribed. Render stays pure. */
export function useClock(): number {
  return useSyncExternalStore(subscribe, () => now, () => 0)
}
