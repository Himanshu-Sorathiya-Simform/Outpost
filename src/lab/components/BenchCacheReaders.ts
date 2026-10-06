import { useCallback, useEffect, useState } from 'react'
import { API } from '@shared/contracts'

/** Read-only looks at Cache Storage. Nothing here opens a cache for writing. */
const POLL_MS = 3000

export type Precached = 'yes' | 'no' | 'unknown'

const hasCaches = (): boolean => typeof caches !== 'undefined'

async function matchOne(url: string): Promise<Precached> {
  if (!hasCaches()) return 'unknown'
  try {
    return (await caches.match(url)) ? 'yes' : 'no'
  } catch {
    // SecurityError in a sandboxed frame, or storage turned off: we cannot tell.
    return 'unknown'
  }
}

/** For each bench key: does Cache Storage hold /api/bench/cache-only/<key>? Re-checked every few seconds and on demand. */
export function usePrecached(keys: readonly string[]): { state: Record<string, Precached>; refresh: () => void } {
  const [state, setState] = useState<Record<string, Precached>>({})
  const [tick, setTick] = useState(0)
  const joined = keys.join('|')

  useEffect(() => {
    let live = true
    const read = async (): Promise<void> => {
      const entries = await Promise.all(joined.split('|').map(async (key) => [key, await matchOne(API.bench('cache-only', key))] as const))
      if (live) setState(Object.fromEntries(entries))
    }
    void read()
    const timer = setInterval(() => void read(), POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [joined, tick])

  return { state, refresh: useCallback(() => setTick((t) => t + 1), []) }
}

export interface ParsedCacheName {
  name: string
  /** Name without the `-v<number>` suffix. */
  base: string
  /** null when the name carries no version suffix. */
  version: number | null
}

const VERSION_SUFFIX = /^(.*)-v(\d+)$/

/** The same heuristic as Lab -> Caches: a trailing `-v<number>` is a version. */
export function parseCacheName(name: string): ParsedCacheName {
  const match = VERSION_SUFFIX.exec(name)
  return match ? { name, base: match[1] ?? name, version: Number(match[2]) } : { name, base: name, version: null }
}

export interface CacheFamily {
  base: string
  /** Newest version first; unversioned names last. */
  members: ParsedCacheName[]
}

export function groupCacheNames(names: readonly string[]): CacheFamily[] {
  const families = new Map<string, ParsedCacheName[]>()
  for (const name of names) {
    const parsed = parseCacheName(name)
    families.set(parsed.base, [...(families.get(parsed.base) ?? []), parsed])
  }
  return [...families]
    .map(([base, members]) => ({ base, members: members.sort((a, b) => (b.version ?? -1) - (a.version ?? -1)) }))
    .sort((a, b) => a.base.localeCompare(b.base))
}

export type CacheNamesState = { status: 'loading' } | { status: 'unsupported' } | { status: 'error'; message: string } | { status: 'ready'; names: string[] }

/** The names from caches.keys(), polled. `unsupported` when the browser (or an insecure origin) has no Cache Storage. */
export function useCacheNames(): { state: CacheNamesState; refresh: () => void } {
  const [state, setState] = useState<CacheNamesState>(hasCaches() ? { status: 'loading' } : { status: 'unsupported' })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!hasCaches()) return
    let live = true
    const read = async (): Promise<void> => {
      try {
        const names = await caches.keys()
        if (live) setState({ status: 'ready', names })
      } catch (thrown) {
        if (live) setState({ status: 'error', message: thrown instanceof Error ? thrown.message : 'caches.keys() failed' })
      }
    }
    void read()
    const timer = setInterval(() => void read(), POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [tick])

  return { state, refresh: useCallback(() => setTick((t) => t + 1), []) }
}
