import { queryOptions, useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { API, type Digest, type InboxSummary } from '@shared/contracts'
import type { ApiResult } from '@/lib/api/types'
import type { AppError } from '@/lib/errors/app-error'
import { applyOptimisticReadAll, restoreCaches, snapshotCaches, type CacheSnapshot } from './dispatch-cache'
import * as endpoints from './endpoints'
import { qk } from './keys'
import { DISPATCH_DEPENDENTS, invalidateEverywhere } from './refresh'
import { useApiQuery, type ApiQuery } from './shared'

export const INBOX_STALE_MS = 15_000

export const inboxQueryOptions = () =>
  queryOptions({
    queryKey: qk.inbox(),
    queryFn: ({ signal }) => endpoints.getInbox({ signal }),
    staleTime: INBOX_STALE_MS,
    meta: { url: API.inbox },
  })

/** Unread / urgent / total counters. Patching a dispatch moves them optimistically (see usePatchDispatch). */
export const useInbox = (): ApiQuery<InboxSummary> => useApiQuery(inboxQueryOptions())

/**
 * Dispatches filed since `since` (ISO time; omitted = the last 24 hours). The same endpoint the periodic
 * background sync is meant to call, so this is where a refreshed digest becomes visible.
 */
export const useDigest = (since?: string | null): ApiQuery<Digest> =>
  useApiQuery(
    queryOptions({
      queryKey: qk.digest(since ?? null),
      queryFn: ({ signal }) => endpoints.getDigest(since, { signal }),
      meta: { url: API.digest },
    }),
  )

interface ReadAllContext {
  snapshot: CacheSnapshot
}

/**
 * Marks everything read. Optimistic: every cached dispatch flips to read and the counters drop to zero at once;
 * a failure puts them back. Resolves with the ApiResult of the new InboxSummary.
 */
export function useMarkAllRead(): UseMutationResult<ApiResult<InboxSummary>, AppError, void, ReadAllContext> {
  const qc = useQueryClient()
  return useMutation<ApiResult<InboxSummary>, AppError, void, ReadAllContext>({
    mutationKey: ['inbox', 'read-all'],
    mutationFn: () => endpoints.markAllRead(),
    onMutate: async () => {
      await Promise.all([qc.cancelQueries({ queryKey: qk.dispatches() }), qc.cancelQueries({ queryKey: qk.inbox() })])
      const snapshot = snapshotCaches(qc, qk.dispatches(), qk.inbox())
      applyOptimisticReadAll(qc)
      return { snapshot }
    },
    onSuccess: (result) => qc.setQueryData<ApiResult<InboxSummary>>(qk.inbox(), result),
    onError: (_error, _vars, context) => {
      if (context) restoreCaches(qc, context.snapshot)
    },
    onSettled: () => invalidateEverywhere(qc, DISPATCH_DEPENDENTS),
  })
}
