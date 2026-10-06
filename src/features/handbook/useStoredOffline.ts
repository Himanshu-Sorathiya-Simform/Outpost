import { useEffect, useState } from 'react'

/** Whether a response for a URL sits in Cache Storage on this device. */
export type StoredState = 'stored' | 'not-stored' | 'unknown'

export interface StoredLookup {
  state: StoredState
  /** The first check has finished. Until then `state` is 'unknown' because nothing has been asked yet, not because it cannot be known. */
  settled: boolean
}

/** Cache Storage only exists in secure contexts, and some browsers and privacy modes withhold it. */
export const cacheStorageAvailable = (): boolean => typeof window !== 'undefined' && window.isSecureContext && 'caches' in window

/**
 * Asks Cache Storage, read-only. Never throws. `ignoreVary` stays false on purpose: a stored response that would not
 * satisfy this request (a different `Vary` header) is not one the app could be served offline.
 */
export async function lookupStored(url: string): Promise<StoredState> {
  if (!cacheStorageAvailable()) return 'unknown'
  try {
    const hit = await window.caches.match(url, { ignoreVary: false })
    return hit ? 'stored' : 'not-stored'
  } catch {
    return 'unknown'
  }
}

const PENDING: StoredLookup = { state: 'unknown', settled: false }

/** Runs `check` now and again whenever something that could have changed the answer happens. Returns the cleanup. */
function watchCacheStorage(check: () => void): () => void {
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') check()
  }
  check()
  window.addEventListener('focus', check)
  window.addEventListener('online', check)
  window.addEventListener('pageshow', check)
  document.addEventListener('visibilitychange', onVisible)
  if (document.readyState !== 'complete') window.addEventListener('load', check, { once: true })
  return () => {
    window.removeEventListener('focus', check)
    window.removeEventListener('online', check)
    window.removeEventListener('pageshow', check)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('load', check)
  }
}

/**
 * Is there a stored copy of `url` on this device? Re-checked on focus, on coming back online, when the tab becomes
 * visible and after the page finishes loading. Pass `recheckKey` (a query's `dataUpdatedAt`, say) to re-check when
 * something that may have written to the cache has just happened.
 */
export function useStoredLookup(url: string, recheckKey?: unknown): StoredLookup {
  const [result, setResult] = useState<StoredLookup>(PENDING)
  useEffect(() => {
    let alive = true
    const stop = watchCacheStorage(() => {
      void lookupStored(url).then((state) => {
        if (alive) setResult((prev) => (prev.settled && prev.state === state ? prev : { state, settled: true }))
      })
    })
    return () => {
      alive = false
      stop()
    }
  }, [url, recheckKey])
  return result
}

export const useStoredOffline = (url: string, recheckKey?: unknown): StoredState => useStoredLookup(url, recheckKey).state

/** The same question for several URLs at once, for a summary line. Answers are keyed by URL. */
export function useStoredOfflineMany(urls: readonly string[], recheckKey?: unknown): { states: Readonly<Record<string, StoredState>>; settled: boolean } {
  const [result, setResult] = useState<{ states: Record<string, StoredState>; settled: boolean }>({ states: {}, settled: false })
  const joined = urls.join('\n')
  useEffect(() => {
    let alive = true
    const list = joined === '' ? [] : joined.split('\n')
    const stop = watchCacheStorage(() => {
      void Promise.all(list.map(async (u) => [u, await lookupStored(u)] as const)).then((pairs) => {
        if (alive) setResult({ states: Object.fromEntries(pairs), settled: true })
      })
    })
    return () => {
      alive = false
      stop()
    }
  }, [joined, recheckKey])
  return result
}
