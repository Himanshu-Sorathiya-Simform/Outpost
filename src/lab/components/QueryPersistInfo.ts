import { useCallback, useEffect, useState } from 'react'
import { readPersistedCacheInfo, usePersistStatus, type PersistedCacheInfo } from '@/lib'

export type PersistedInfoState = { phase: 'loading' } | { phase: 'ready'; info: PersistedCacheInfo | null }

/** What is on disk, read from IndexedDB on mount, after every write the persister reports, and on demand. */
export function usePersistedInfo(): { state: PersistedInfoState; refresh: () => Promise<void> } {
  const [state, setState] = useState<PersistedInfoState>({ phase: 'loading' })
  const lastWrite = usePersistStatus((s) => s.lastPersistAt)

  const refresh = useCallback(async (): Promise<void> => {
    setState({ phase: 'ready', info: await readPersistedCacheInfo() })
  }, [])

  useEffect(() => {
    let live = true
    void readPersistedCacheInfo().then((info) => {
      if (live) setState({ phase: 'ready', info })
    })
    return () => {
      live = false
    }
  }, [lastWrite])

  return { state, refresh }
}
