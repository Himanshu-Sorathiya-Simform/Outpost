import { queryOptions, useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import {
  API,
  type ChaosState,
  type HeaderProfile,
  type HeaderProfileBody,
  type LabState,
  type LabTruth,
  type ReleasePatch,
  type ReleaseState,
  type RequestLogPage,
  type SessionControl,
  type SessionControlResult,
  type WireSpawnRequest,
  type WireSpawnResult,
  type WireState,
} from '@shared/contracts'
import type { ApiResult } from '@/lib/api/types'
import type { AppError } from '@/lib/errors/app-error'
import * as endpoints from './endpoints'
import { qk } from './keys'
import { pollInterval, useApiQuery, type ApiQuery, type PollOptions } from './shared'

// Everything here is an instrument, not product data. Queries live under ['lab', ...], which the persister never
// writes to disk, and carry `persist: false` for anyone reading the meta.
const instrument = (url: string) => ({ url, persist: false })

export const labStateQueryOptions = (pollMs?: number) =>
  queryOptions({
    queryKey: qk.lab.state(),
    queryFn: ({ signal }) => endpoints.getLabState({ signal }),
    staleTime: 0,
    refetchInterval: pollInterval(pollMs),
    meta: instrument(API.lab.state),
  })

export const labTruthQueryOptions = (pollMs?: number) =>
  queryOptions({
    queryKey: qk.lab.truth(),
    queryFn: ({ signal }) => endpoints.getLabTruth({ signal }),
    staleTime: 0,
    refetchInterval: pollInterval(pollMs),
    meta: instrument(API.lab.truth),
  })

/** Server-side lab switches and counters (chaos, wire, release, header profile, session TTL). */
export const useLabState = ({ pollMs, enabled = true }: PollOptions = {}): ApiQuery<LabState> =>
  useApiQuery({ ...labStateQueryOptions(pollMs), enabled })

/**
 * What the server believes right now: feed revision, inbox counters, every dispatch's rev and flags, station revs,
 * bench revs, handbook edition, session. Compare it with React Query and Cache Storage to find drift.
 */
export const useLabTruth = ({ pollMs, enabled = true }: PollOptions = {}): ApiQuery<LabTruth> =>
  useApiQuery({ ...labTruthQueryOptions(pollMs), enabled })

/** A lab write that refreshes the lab state query when it lands. Never retried: a repeated chaos toggle would flip it back. */
function useLabMutation<V, R>(name: string, run: (vars: V) => Promise<ApiResult<R>>): UseMutationResult<ApiResult<R>, AppError, V> {
  const qc = useQueryClient()
  return useMutation<ApiResult<R>, AppError, V>({
    mutationKey: ['lab', name],
    mutationFn: run,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.lab.state() }),
  })
}

/** Replace the whole chaos state (switches and rules). Resolves with what the server stored. */
export const useUpdateChaos = (): UseMutationResult<ApiResult<ChaosState>, AppError, ChaosState> => useLabMutation('chaos', endpoints.putChaos)

/**
 * Toggle a named preset: a rule id ('lie-fi', 'flaky', 'captive-portal', 'slow-8s', 'corrupt-json', 'rate-limited',
 * 'stale-chunks', 'drop-writes', 'truncate', 'hang-signal', 'empty-body', 'slow-body') or 'hard-down',
 * 'schema-drift', 'all-clear'. The variable is the preset name.
 */
export const useApplyChaosPreset = (): UseMutationResult<ApiResult<ChaosState>, AppError, string> =>
  useLabMutation('chaos-preset', endpoints.applyChaosPreset)

/** Change any subset of the wire generator (auto, everySec, pushOnNew). */
export const useUpdateWire = (): UseMutationResult<ApiResult<WireState>, AppError, Partial<WireState>> => useLabMutation('wire', endpoints.putWire)

/** File 1-10 dispatches from the wire generator right now. The feed is not refreshed on purpose: that is the stale-cache exercise. */
export const useSpawnWire = (): UseMutationResult<ApiResult<WireSpawnResult>, AppError, WireSpawnRequest> => useLabMutation('wire-spawn', endpoints.spawnWire)

/** Simulate a deploy: change latestClient, minClient, api version or handbook edition (any subset). */
export const useUpdateRelease = (): UseMutationResult<ApiResult<ReleaseState>, AppError, ReleasePatch> => useLabMutation('release', endpoints.putRelease)

/** Switch the server's caching headers profile. The variable is the profile name. */
export function useSetHeaderProfile(): UseMutationResult<ApiResult<HeaderProfileBody>, AppError, HeaderProfile> {
  return useLabMutation('headers', (profile: HeaderProfile) => endpoints.putHeaderProfile({ profile }))
}

/**
 * Expire every session on the server, or set the TTL of sessions created from now on. Deliberately leaves the
 * client's session query alone: the UI keeps saying "signed in" until something asks the server again.
 */
export const useSessionControl = (): UseMutationResult<ApiResult<SessionControlResult>, AppError, SessionControl> =>
  useLabMutation('session-control', endpoints.controlSession)

/** Empty the server's request log (the client-side copy is cleared separately with clearLabLog()). */
export const useClearServerLog = (): UseMutationResult<ApiResult<RequestLogPage>, AppError, void> => useLabMutation('clear-log', () => endpoints.deleteLabLog())

/** Re-seed the server (data, chaos, wire, release, headers), then invalidate every cached query, because all of it may be wrong now. */
export function useResetLab(): UseMutationResult<ApiResult<LabState>, AppError, void> {
  const qc = useQueryClient()
  return useMutation<ApiResult<LabState>, AppError, void>({
    mutationKey: ['lab', 'reset'],
    mutationFn: () => endpoints.resetLab(),
    onSuccess: () => qc.invalidateQueries(),
  })
}
