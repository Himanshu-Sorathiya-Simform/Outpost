import {
  queryOptions,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type UseInfiniteQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query'
import { useMemo } from 'react'
import { z } from 'zod'
import { API, Dispatch, type DispatchCreate, type DispatchPatch, type DispatchPage } from '@shared/contracts'
import type { ApiResult, ResponseMeta } from '@/lib/api/types'
import { AppError } from '@/lib/errors/app-error'
import { notify } from '@/lib/notify'
import { retryDelayMs, shouldRetry } from '@/lib/query/client'
import { applyOptimisticPatch, dispatchEtag, findCachedDispatch, storeDispatch, type FeedData } from './dispatch-cache'
import * as endpoints from './endpoints'
import { normalizeFeedFilters, qk, type FeedFilters } from './keys'
import { invalidateEverywhere, DISPATCH_DEPENDENTS } from './refresh'
import { onUnauthorized } from './session-prompt'
import { asAppError, useApiQuery, type ApiQuery } from './shared'

// ─── feed ─────────────────────────────────────────────────────────────────────

export type DispatchFeed = UseInfiniteQueryResult<FeedData, AppError> & {
  /** Every loaded page, flattened in order, each dispatch once. */
  items: Dispatch[]
  /** One ResponseMeta per loaded page, in page order. Page 0 is the head of the feed. */
  pageMetas: ResponseMeta[]
  /** Meta of page 0, the one that says how fresh the top of the list is. */
  meta: ResponseMeta | undefined
  /** Total matching the filters, as of the first page. */
  total: number | undefined
  /** Server feed revision as of the first page; it moves whenever anything is filed or changed. */
  feedRev: number | undefined
}

/** Pages joined in order. Keyset cursors keep pages disjoint, but a cache that was patched by hand could repeat an id. */
export function flattenFeed(data: FeedData | undefined): Dispatch[] {
  if (!data) return []
  const seen = new Set<string>()
  const items: Dispatch[] = []
  for (const page of data.pages) {
    for (const item of page.data.items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      items.push(item)
    }
  }
  return items
}

/** The dispatch log, newest first, one infinite query per filter set. Call `fetchNextPage()` for "load more". */
export function useDispatchFeed(rawFilters: FeedFilters = {}): DispatchFeed {
  // The key is built from the normalised filters, so the request must be too: two callers that share a cache entry
  // ('mast' and ' mast ') have to be asking the server the same thing.
  const filters = normalizeFeedFilters(rawFilters)
  const query = useInfiniteQuery<ApiResult<DispatchPage>, AppError, FeedData, ReturnType<typeof qk.feed>, string | undefined>({
    queryKey: qk.feed(filters),
    queryFn: ({ pageParam, signal }) => endpoints.getDispatchPage({ ...filters, cursor: pageParam }, { signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
    meta: { url: API.dispatches },
  })

  const { data } = query
  const derived = useMemo(
    () => ({
      items: flattenFeed(data),
      pageMetas: data?.pages.map((p) => p.meta) ?? [],
      meta: data?.pages[0]?.meta,
      total: data?.pages[0]?.data.total,
      feedRev: data?.pages[0]?.data.feedRev,
    }),
    [data],
  )
  return { ...query, ...derived }
}

// ─── detail ───────────────────────────────────────────────────────────────────

export const dispatchQueryOptions = (id: string | undefined) =>
  queryOptions({
    queryKey: qk.dispatch(id ?? ''),
    // A route param can be undefined for a render; the query then sits idle instead of asking for /api/dispatches/.
    queryFn: id === undefined ? skipToken : ({ signal }) => endpoints.getDispatch(id, { signal }),
    meta: { url: API.dispatch(id ?? '') },
  })

export const useDispatch = (id: string | undefined): ApiQuery<Dispatch> => useApiQuery(dispatchQueryOptions(id))

// ─── patch (optimistic) ───────────────────────────────────────────────────────

export interface PatchDispatchVars {
  id: string
  patch: DispatchPatch
}
interface PatchContext {
  /** The values this patch overwrote, for the fields it touched only: applying it undoes exactly this write. */
  revert: DispatchPatch
}

/** What the touched fields of `before` held, so a failed write can put back its own changes and nothing else. */
function revertFor(before: Dispatch | undefined, patch: DispatchPatch): DispatchPatch {
  const revert: DispatchPatch = {}
  if (!before) return revert
  if (patch.read !== undefined) revert.read = before.read
  if (patch.acked !== undefined) revert.acked = before.acked
  if (patch.starred !== undefined) revert.starred = before.starred
  return revert
}
export const PATCH_DISPATCH_KEY = ['dispatch', 'patch'] as const

/** What a 412 carries: the dispatch as the server has it now. */
const ConflictDetails = z.object({ current: Dispatch })

/**
 * Read / acknowledge / star a dispatch, optimistically.
 *
 *  1. onMutate cancels in-flight reads (a response that lands mid-write would overwrite the optimistic state),
 *     remembers what the touched fields held, and applies the patch to every cache the dispatch lives in, inbox
 *     counters included. (onMutate of every call runs at once; only the requests wait their turn, see 2.)
 *  2. The request goes out with If-Match built from the newest cached revision. Patches run one at a time
 *     (mutation scope), so a second tap sends the revision the first one produced instead of a stale one.
 *  3. Failure puts back the fields this patch changed, not a snapshot of the whole cache: a snapshot taken at
 *     mutate time would also wipe the optimistic state of writes queued behind this one and any fresher data that
 *     arrived while it was in flight. A `conflict` then replaces the cache with the server's `current` copy and says so;
 *     `unauthorized` opens the clock-in dialog and refreshes the session.
 *  4. Once the last pending patch settles, dispatches, inbox and digest are invalidated here and in other tabs.
 *
 * Resolves with the ApiResult of the updated dispatch; rejects with an AppError.
 */
export function usePatchDispatch(): UseMutationResult<ApiResult<Dispatch>, AppError, PatchDispatchVars, PatchContext> {
  const qc = useQueryClient()
  return useMutation<ApiResult<Dispatch>, AppError, PatchDispatchVars, PatchContext>({
    mutationKey: PATCH_DISPATCH_KEY,
    scope: { id: 'dispatch-patch' },
    mutationFn: ({ id, patch }) =>
      asAppError('mutation:patch-dispatch', async () => {
        // Read at send time, not at mutate time: a patch queued behind another one must see the revision that one wrote.
        const cached = findCachedDispatch(qc, id)
        return endpoints.patchDispatch(id, patch, { ifMatch: cached ? dispatchEtag(cached) : undefined })
      }),
    onMutate: async ({ id, patch }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: qk.dispatch(id) }),
        qc.cancelQueries({ queryKey: qk.feeds() }),
        qc.cancelQueries({ queryKey: qk.inbox() }),
      ])
      const revert = revertFor(findCachedDispatch(qc, id), patch)
      applyOptimisticPatch(qc, id, patch)
      return { revert }
    },
    onSuccess: (result) => storeDispatch(qc, result.data, result.meta),
    onError: (error, { id, patch }, context) => {
      if (context && Object.keys(context.revert).length > 0) applyOptimisticPatch(qc, id, context.revert)

      if (error.kind === 'conflict') {
        // Without `current` (a bare 409) there is nothing to swap in; the invalidation in onSettled refetches instead.
        const details = ConflictDetails.safeParse(error.context.details)
        if (details.success) storeDispatch(qc, details.data.current)
        notify({
          key: `dispatch-conflict:${id}`,
          tone: 'warn',
          title: 'Changed elsewhere',
          message: 'Another operator or tab updated this dispatch first. The latest version is showing and your change was not applied.',
        })
      } else if (error.kind === 'unauthorized') {
        onUnauthorized(qc, patch.acked === undefined ? null : 'Acknowledging a dispatch needs an active shift. Clock in to continue.')
      }
    },
    onSettled: () => {
      // While other patches are still pending, invalidating now would refetch over their optimistic state.
      // The last one to settle does it for all of them. (This mutation still counts as pending inside its own onSettled.)
      if (qc.isMutating({ mutationKey: PATCH_DISPATCH_KEY }) <= 1) invalidateEverywhere(qc, DISPATCH_DEPENDENTS)
    },
  })
}

// ─── create ───────────────────────────────────────────────────────────────────

/** `clientId` is optional here only as a convenience; see useCreateDispatch. */
export type CreateDispatchInput = Omit<DispatchCreate, 'clientId'> & { clientId?: string }

/**
 * A fresh idempotency key. crypto.randomUUID only exists in secure contexts, and this app is also opened over
 * plain http on a LAN address, so there is a fallback.
 */
export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** Failures worth repeating for a write: the server may have answered too late or not at all. A dead link is not retried, the outbox is for that. */
const RETRYABLE_WRITE_KINDS: ReadonlySet<string> = new Set(['timeout', 'unavailable', 'server', 'rate-limited'])

/**
 * File a dispatch. The clientId doubles as the Idempotency-Key, so sending the same one twice (a retry, a double
 * click, a replay from the outbox) files once: the server answers the repeat with 200 and the original dispatch
 * instead of 201, and `result.meta.status` tells you which happened.
 *
 * Pass your own `clientId` (generate it once per form with newClientId()) if you may need to queue the dispatch
 * offline afterwards: the queued copy must carry the key of the failed attempt. When omitted, one is generated
 * per attempt, and on failure `error.context.clientId` tells you what was used.
 *
 * This hook never queues anything offline; the compose page decides that from `error.kind`. It ignores the lab
 * network mode (`always`) because the whole point is to learn that the send failed, rather than wait for a link.
 */
export function useCreateDispatch(): UseMutationResult<ApiResult<Dispatch>, AppError, CreateDispatchInput> {
  const qc = useQueryClient()
  return useMutation<ApiResult<Dispatch>, AppError, CreateDispatchInput>({
    mutationKey: ['dispatch', 'create'],
    networkMode: 'always',
    // Safe to repeat only because every attempt carries the same Idempotency-Key.
    retry: (count, error) => RETRYABLE_WRITE_KINDS.has(error.kind) && shouldRetry(count, error),
    retryDelay: (count, error) => retryDelayMs(count, error),
    mutationFn: (input) => {
      const clientId = input.clientId ?? newClientId()
      return asAppError('mutation:create-dispatch', async () => {
        try {
          return await endpoints.createDispatch({ ...input, clientId }, clientId)
        } catch (thrown) {
          if (AppError.is(thrown)) thrown.context.clientId = clientId
          throw thrown
        }
      })
    },
    onSuccess: (result) => {
      storeDispatch(qc, result.data, result.meta)
      invalidateEverywhere(qc, [qk.feeds(), qk.inbox(), qk.digests()])
    },
    onError: (error) => {
      if (error.kind === 'unauthorized') onUnauthorized(qc, 'Filing a dispatch needs an active shift. Clock in to continue.')
    },
  })
}
