import { queryClient } from '@/lib'
import type { IconName } from '@/ui'
import type { QueryRowData } from './QueryModel'

export type QueryAction = 'invalidate' | 'refetch' | 'reset' | 'remove'

export interface QueryActionInfo {
  action: QueryAction
  label: string
  icon: IconName
  /** One line: what the call does to this entry, in React Query's own terms. */
  does: string
}

export const QUERY_ACTIONS: readonly QueryActionInfo[] = [
  { action: 'invalidate', label: 'Invalidate', icon: 'clock', does: 'Marks the entry stale. A screen showing it refetches at once; an unmounted entry waits for its next use.' },
  { action: 'refetch', label: 'Refetch', icon: 'refresh', does: 'Fetches again now, fresh or not, keeping the old data on screen until the new data lands.' },
  { action: 'reset', label: 'Reset', icon: 'arrow-left', does: 'Returns the entry to its first state, with no data at all, then refetches if a screen is showing it.' },
  { action: 'remove', label: 'Remove', icon: 'trash', does: 'Deletes the entry from the cache. A screen still showing it keeps its last render until something re-asks.' },
]

/** Every action addresses one entry by its exact key. */
export function runQueryAction(action: QueryAction, row: Pick<QueryRowData, 'key'>): void {
  const filter = { queryKey: row.key, exact: true } as const
  switch (action) {
    case 'invalidate':
      void queryClient.invalidateQueries(filter)
      return
    case 'refetch':
      void queryClient.refetchQueries(filter)
      return
    case 'reset':
      void queryClient.resetQueries(filter)
      return
    case 'remove':
      queryClient.removeQueries(filter)
  }
}
