import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppError } from '@/lib/errors/app-error'
import { toAppError } from '@/lib/errors/normalize'
import { cacheSupport, readCacheSummaries, type CacheSummary, type CacheSupport } from './cache-store'

export const AUTO_REFRESH_MS = 2000

export interface CacheListState {
  /** `error` is only a phase when nothing has ever loaded; afterwards a failed read keeps the old list and sets `error`. */
  phase: 'loading' | 'ready' | 'error' | 'unsupported'
  support: CacheSupport
  summaries: CacheSummary[]
  error: AppError | null
  readAt: number | null
  refreshing: boolean
  /** Bumps on every successful read; children re-read their own entries when it changes. */
  tick: number
  refresh(): void
}

/** The list of caches and their entry counts, read on mount, on demand, and every 2 s when `auto` is on. */
export function useCacheList(auto: boolean): CacheListState {
  const support = useMemo(cacheSupport, [])
  const [data, setData] = useState<Pick<CacheListState, 'phase' | 'summaries' | 'error' | 'readAt' | 'tick'>>({ phase: support.available ? 'loading' : 'unsupported', summaries: [], error: null, readAt: null, tick: 0 })
  const [refreshing, setRefreshing] = useState(false)
  const busy = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const load = useCallback(async (): Promise<void> => {
    if (!support.available || busy.current) return
    busy.current = true
    setRefreshing(true)
    try {
      const summaries = await readCacheSummaries()
      if (alive.current) setData((d) => ({ phase: 'ready', summaries, error: null, readAt: Date.now(), tick: d.tick + 1 }))
    } catch (err) {
      if (alive.current) setData((d) => ({ ...d, phase: d.readAt === null ? 'error' : d.phase, error: toAppError(err, { source: 'lab:caches' }) }))
    } finally {
      busy.current = false
      if (alive.current) setRefreshing(false)
    }
  }, [support.available])

  useEffect(() => {
    void load()
    if (!auto) return
    const timer = setInterval(() => void load(), AUTO_REFRESH_MS)
    return () => clearInterval(timer)
  }, [auto, load])

  const refresh = useCallback(() => void load(), [load])
  return { ...data, support, refreshing, refresh }
}
