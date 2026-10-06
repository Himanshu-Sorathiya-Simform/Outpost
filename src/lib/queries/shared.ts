import { useQuery, type QueryKey, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'
import type { ApiResult, ResponseMeta } from '@/lib/api/types'
import type { AppError } from '@/lib/errors/app-error'
import { toAppError } from '@/lib/errors/normalize'

/**
 * What every data hook returns: the usual TanStack result, except that `data` is the validated payload
 * and the provenance of that payload (source, age, timing, headers) sits beside it as `meta`.
 * Feed `meta` straight into <ProvenanceChip meta={query.meta} />.
 *
 * The cache itself holds the full ApiResult, so meta survives as long as the data does (and is persisted with it).
 * `error` is typed: apiFetch only ever throws AppError.
 */
export type ApiQuery<T> = Omit<UseQueryResult<ApiResult<T>, AppError>, 'data'> & {
  data: T | undefined
  meta: ResponseMeta | undefined
}

export function useApiQuery<T, K extends QueryKey>(options: UseQueryOptions<ApiResult<T>, AppError, ApiResult<T>, K>): ApiQuery<T> {
  const query = useQuery(options)
  return { ...query, data: query.data?.data, meta: query.data?.meta }
}

/** Mutation functions run caller code around apiFetch; whatever escapes leaves as an AppError, so `mutateAsync` rejects with one. */
export async function asAppError<T>(source: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (thrown) {
    throw toAppError(thrown, { source })
  }
}

/** `false` switches polling off; anything that is not a positive number does too. */
export const pollInterval = (ms: number | undefined): number | false => (ms !== undefined && ms > 0 ? ms : false)

export interface PollOptions {
  /** Refetch on this interval (ms) while the tab is visible. Omit or 0 for no polling. */
  pollMs?: number
  enabled?: boolean
}
