import { useCallback, useEffect, useRef, useState } from 'react'
import { readStorageLayer, type StorageSnapshot } from './ConsistencyStorage'

export const PROBE_INTERVAL_MS = 3000

export interface Probe {
  /** null until the first read finishes. */
  storage: StorageSnapshot | null
  /** Epoch ms of the last completed Cache Storage read. */
  checkedAt: number | null
  paused: boolean
  setPaused: (paused: boolean) => void
  /** Read Cache Storage now, whether or not polling is paused. */
  checkNow: () => void
}

/**
 * Reads Cache Storage every three seconds (unless paused) for the inbox summary, the feed and the given dispatch ids.
 * A read that is still running when the next tick arrives is skipped, not stacked.
 */
export function useConsistencyProbe(ids: readonly string[]): Probe {
  const [storage, setStorage] = useState<StorageSnapshot | null>(null)
  const [checkedAt, setCheckedAt] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const running = useRef(false)
  const joined = ids.join('|')

  const read = useCallback(async (): Promise<void> => {
    if (running.current) return
    running.current = true
    try {
      setStorage(await readStorageLayer(joined === '' ? [] : joined.split('|')))
      setCheckedAt(Date.now())
    } finally {
      running.current = false
    }
  }, [joined])

  useEffect(() => {
    void read()
  }, [read])

  useEffect(() => {
    if (paused) return
    const timer = setInterval(() => void read(), PROBE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [read, paused])

  return { storage, checkedAt, paused, setPaused, checkNow: () => void read() }
}
