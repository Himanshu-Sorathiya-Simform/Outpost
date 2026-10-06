import { queryOptions, useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { API, type BenchResponse, type BenchStrategy } from '@shared/contracts'
import type { ApiResult } from '@/lib/api/types'
import type { AppError } from '@/lib/errors/app-error'
import * as endpoints from './endpoints'
import { qk } from './keys'
import { useApiQuery, type ApiQuery } from './shared'

export const benchQueryOptions = (strategy: BenchStrategy, key: string) =>
  queryOptions({
    queryKey: qk.bench(strategy, key),
    queryFn: ({ signal }) => endpoints.getBench(strategy, key, { signal }),
    // The bench exists to watch what a service worker strategy answers, so React Query must not get in the way:
    // no automatic refetching after the mount (the page has a button), no retries that would hide a failure, and the request is
    // attempted even while the browser says it is offline, because "offline" is half of what is being tested.
    staleTime: Infinity,
    // Infinite freshness alone would make a remount (or a reading restored from the persisted cache) show an old
    // reading as if it had just been taken. Every mount is a new measurement.
    refetchOnMount: 'always',
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    networkMode: 'always',
    meta: { url: API.bench(strategy, key) },
  })

/**
 * One reading from /api/bench/:strategy/:key. The five strategies are five different URLs, so your service worker
 * can match each with its own strategy. Fetches once on mount; call `refetch()` for another. Pass
 * `enabled: false` to start idle (refetch() still works).
 */
export const useBench = (strategy: BenchStrategy, key: string, { enabled = true }: { enabled?: boolean } = {}): ApiQuery<BenchResponse> =>
  useApiQuery({ ...benchQueryOptions(strategy, key), enabled })

export interface BumpBenchVars {
  strategy: BenchStrategy
  key: string
}

/**
 * Changes the truth on the server (rev + 1). Deliberately does NOT refresh the cached reading: the gap between
 * the two is what the bench is for. Only the lab truth instrument is told to look again.
 */
export function useBumpBench(): UseMutationResult<ApiResult<endpoints.BenchBump>, AppError, BumpBenchVars> {
  const qc = useQueryClient()
  return useMutation<ApiResult<endpoints.BenchBump>, AppError, BumpBenchVars>({
    mutationKey: ['bench', 'bump'],
    networkMode: 'always',
    mutationFn: ({ strategy, key }) => endpoints.bumpBench(strategy, key),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.lab.truth() }),
  })
}
