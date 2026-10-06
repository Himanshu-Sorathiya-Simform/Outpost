import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 560px)'

const subscribe = (notify: () => void): (() => void) => {
  const list = window.matchMedia(QUERY)
  list.addEventListener('change', notify)
  return () => list.removeEventListener('change', notify)
}

/** True on phone-width screens. Drives what folds away, never what exists. */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
