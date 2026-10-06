import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { StationKind, StationStatus } from '@shared/contracts'
import { SORT_KEYS, type SortDir, type SortKey, type StationFilters } from './stations'

export interface StationView {
  filters: StationFilters
  sort: { key: SortKey; dir: SortDir }
  active: boolean
  setFilter: <K extends keyof StationFilters>(key: K, value: StationFilters[K]) => void
  setSort: (key: SortKey) => void
  clear: () => void
}

const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: 'code', dir: 'asc' }
/** Times and headcounts read best newest or largest first. */
const DESC_FIRST: ReadonlySet<SortKey> = new Set<SortKey>(['contact', 'crew', 'elevation'])

/** Filters and sort order live in the URL, so a filtered register can be bookmarked or sent to someone. */
export function useStationView(): StationView {
  const [params, setParams] = useSearchParams()

  const status = StationStatus.safeParse(params.get('status'))
  const kind = StationKind.safeParse(params.get('kind'))
  const sortKey = SORT_KEYS.find((k) => k === params.get('sort')) ?? DEFAULT_SORT.key
  const sortDir: SortDir = params.get('dir') === 'desc' ? 'desc' : 'asc'

  const filters: StationFilters = { status: status.success ? status.data : 'all', kind: kind.success ? kind.data : 'all', q: params.get('q') ?? '' }

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          mutate(next)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setFilter = useCallback<StationView['setFilter']>(
    (key, value) => update((next) => (value === 'all' || value === '' ? next.delete(key) : next.set(key, value))),
    [update],
  )

  const setSort = useCallback(
    (key: SortKey) =>
      update((next) => {
        const current = SORT_KEYS.find((k) => k === next.get('sort')) ?? DEFAULT_SORT.key
        next.set('sort', key)
        next.set('dir', key === current ? (next.get('dir') === 'desc' ? 'asc' : 'desc') : DESC_FIRST.has(key) ? 'desc' : 'asc')
      }),
    [update],
  )

  const clear = useCallback(() => update((next) => ['status', 'kind', 'q'].forEach((k) => next.delete(k))), [update])

  return { filters, sort: { key: sortKey, dir: sortDir }, active: filters.status !== 'all' || filters.kind !== 'all' || filters.q !== '', setFilter, setSort, clear }
}
