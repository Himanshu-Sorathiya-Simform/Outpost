import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { OutboxItem } from '@shared/sw-protocol'
import { callSeam, useSwMessageLog } from '@/lib/bridge'
import type { AppError } from '@/lib/errors/app-error'
import { toAppError } from '@/lib/errors/normalize'
import { pwa, usePwaStore } from '@/pwa'

export type OutboxState =
  | { status: 'loading' }
  /** sync.listQueued is still a stub in src/pwa/sync.ts. */
  | { status: 'not-wired' }
  | { status: 'ready'; items: OutboxItem[]; checkedAt: number }
  /** The last listing failed. `items` is the previous good one, if any. */
  | { status: 'error'; error: AppError; items: OutboxItem[] | null; checkedAt: number | null }

export interface Outbox {
  state: OutboxState
  refreshing: boolean
  refresh: () => Promise<void>
}

const OutboxItems = z.array(OutboxItem)

/**
 * The seam-managed outbox, read through sync.listQueued. It is listed on mount, when the window regains focus,
 * when the queued count changes, and when the service worker reports a finished sync.
 */
export function useOutbox(): Outbox {
  const [state, setState] = useState<OutboxState>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const latest = useRef(0)
  const queuedCount = usePwaStore((s) => s.queuedCount)
  const syncMessageId = useSwMessageLog((s) => s.entries.find((e) => e.direction === 'in' && e.valid && e.type === 'sync-complete')?.id ?? 0)

  const refresh = useCallback(async (): Promise<void> => {
    const mine = ++latest.current
    setRefreshing(true)
    try {
      const listed = await callSeam('sync.listQueued', () => pwa.sync.listQueued(), { quiet: true })
      if (mine !== latest.current) return
      if (listed === undefined) {
        setState({ status: 'not-wired' })
        return
      }
      const parsed = OutboxItems.safeParse(listed)
      if (!parsed.success) throw toAppError(parsed.error, { source: 'seam:sync.listQueued' })
      setState({ status: 'ready', items: parsed.data, checkedAt: Date.now() })
    } catch (thrown) {
      if (mine !== latest.current) return
      const error = toAppError(thrown, { source: 'seam:sync.listQueued' })
      setState((prev) => {
        const kept = prev.status === 'ready' || prev.status === 'error' ? prev : null
        return { status: 'error', error, items: kept?.items ?? null, checkedAt: kept?.checkedAt ?? null }
      })
    } finally {
      if (mine === latest.current) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, queuedCount, syncMessageId])

  useEffect(() => {
    const onFocus = (): void => void refresh()
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return { state, refreshing, refresh }
}
