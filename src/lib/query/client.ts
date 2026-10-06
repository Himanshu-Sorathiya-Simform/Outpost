import { MutationCache, QueryCache, QueryClient, type DefaultOptions } from '@tanstack/react-query'
import { AppError } from '@/lib/errors/app-error'
import { errorCenter } from '@/lib/errors/center'
import { toAppError } from '@/lib/errors/normalize'
import { refCounted } from '@/lib/lifecycle'
import { getLabSettings, useLabSettings, type LabSettingValues } from '@/lib/settings/lab-settings'

export const RETRY_DELAY_CAP_MS = 8000
const RETRY_DELAY_BASE_MS = 500

/** Only failures a second attempt could fix are retried, and never more often than the lab setting allows. */
export function shouldRetry(failureCount: number, error: unknown, maxRetries: number = getLabSettings().retries): boolean {
  return AppError.is(error) && error.retryable && failureCount < maxRetries
}

/**
 * Exponential backoff with jitter, capped. A 429's Retry-After is honoured as a floor (still under the cap, so a
 * server asking for minutes does not freeze the UI; the error stays visible instead).
 */
export function retryDelayMs(failureCount: number, error: unknown, random: () => number = Math.random): number {
  const exponential = RETRY_DELAY_BASE_MS * 2 ** failureCount
  const jitter = random() * exponential * 0.5
  const retryAfterMs = AppError.is(error) && error.context.retryAfterSec ? error.context.retryAfterSec * 1000 : 0
  return Math.min(RETRY_DELAY_CAP_MS, Math.max(exponential + jitter, retryAfterMs))
}

/** The settings-driven part of the defaults. Re-applied live through setDefaultOptions. */
export function liveDefaults(settings: LabSettingValues): DefaultOptions {
  return {
    queries: {
      staleTime: settings.staleTimeSec * 1000,
      gcTime: settings.gcTimeMin * 60_000,
      refetchOnWindowFocus: settings.refetchOnFocus,
      networkMode: settings.networkMode,
    },
    mutations: { networkMode: settings.networkMode },
  }
}

function isSilent(meta: Record<string, unknown> | undefined): boolean {
  return meta?.silent === true
}

/**
 * Queries and mutations report to the error centre silently: the screen that asked for the data already renders
 * the failure (ErrorState), so a toast on top would say everything twice. Opt a query out entirely with `meta: { silent: true }`.
 */
function reportFromCache(error: unknown, source: string): void {
  const normalized = toAppError(error, { source })
  if (normalized.kind === 'aborted') return
  errorCenter.report(normalized, { source, silent: true })
}

export function createQueryClient(settings: LabSettingValues = getLabSettings()): QueryClient {
  const live = liveDefaults(settings)
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!isSilent(query.meta)) reportFromCache(error, `query:${query.queryHash}`)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        if (!isSilent(mutation.meta)) reportFromCache(error, `mutation:${mutation.options.mutationKey?.join('/') ?? 'anonymous'}`)
      },
    }),
    defaultOptions: {
      queries: { ...live.queries, retry: (n, err) => shouldRetry(n, err), retryDelay: (n, err) => retryDelayMs(n, err) },
      // A mutation is not safely repeatable in general; callers that send an Idempotency-Key can opt in to retries.
      mutations: { ...live.mutations, retry: false },
    },
  })
}

/** The app's one QueryClient. Every data query should carry `meta: { url: '<api path>' }` so the SW bridge can invalidate by URL. */
export const queryClient: QueryClient = createQueryClient()

/** Pushes lab setting changes (stale time, gc time, focus refetch, network mode) into the live client. Idempotent. */
export const startQuerySettingsSync = refCounted((): (() => void) => {
  const apply = (): void => {
    const live = liveDefaults(getLabSettings())
    const current = queryClient.getDefaultOptions()
    queryClient.setDefaultOptions({
      queries: { ...current.queries, ...live.queries },
      mutations: { ...current.mutations, ...live.mutations },
    })
  }
  apply()
  return useLabSettings.subscribe(apply)
})
