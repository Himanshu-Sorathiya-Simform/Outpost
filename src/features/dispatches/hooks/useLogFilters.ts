import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { parseLogFilters, writeLogFilters, type LogFilterValues } from '../filters'

export interface UseLogFilters {
  values: LogFilterValues
  /** Merge a change into the address bar. Typing replaces the history entry; toggles add one so Back undoes them. */
  update(change: Partial<LogFilterValues>, options?: { replace?: boolean }): void
  clear(): void
}

/** A change the address bar has not caught up with yet. It applies only while the address is still the one it was made against. */
interface Pending {
  base: URLSearchParams
  change: Partial<LogFilterValues>
}

/**
 * The filter state of /log. The address bar is the only store, so reload, Back and Forward all restore it.
 * The router commits a navigation in a transition, a beat after the click; the controls are controlled by these
 * values, so without the pending overlay React would put a just-clicked checkbox back for that beat.
 */
export function useLogFilters(): UseLogFilters {
  const [params, setParams] = useSearchParams()
  const [pending, setPending] = useState<Pending | null>(null)
  const values = useMemo(() => {
    const fromAddress = parseLogFilters(params)
    return pending?.base === params ? { ...fromAddress, ...pending.change } : fromAddress
  }, [params, pending])

  const update = useCallback(
    (change: Partial<LogFilterValues>, options: { replace?: boolean } = {}) => {
      const merged = { ...(pending?.base === params ? pending.change : undefined), ...change }
      setPending({ base: params, change: merged })
      setParams((prev) => writeLogFilters({ ...parseLogFilters(prev), ...change }), { replace: options.replace ?? false })
    },
    [params, pending, setParams],
  )
  const clear = useCallback(() => {
    setPending({ base: params, change: { severity: undefined, station: undefined, q: '', unread: false, starred: false } })
    setParams(new URLSearchParams())
  }, [params, setParams])
  return { values, update, clear }
}
