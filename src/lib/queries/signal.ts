import { queryOptions } from '@tanstack/react-query'
import { API, type SignalBoard } from '@shared/contracts'
import * as endpoints from './endpoints'
import { qk } from './keys'
import { pollInterval, useApiQuery, type ApiQuery, type PollOptions } from './shared'

export const signalQueryOptions = (pollMs?: number) =>
  queryOptions({
    queryKey: qk.signal(),
    queryFn: ({ signal }) => endpoints.getSignal({ signal }),
    // Live telemetry: never fresh, so every mount and every focus asks again.
    staleTime: 0,
    refetchInterval: pollInterval(pollMs),
    // A board nobody is looking at is not worth the requests.
    refetchIntervalInBackground: false,
    meta: { url: API.signal },
  })

/**
 * The live signal board. `seq` increments on every server answer, so a copy that came from anywhere but the
 * server is recognisable at a glance. Polls every `pollMs` while the tab is visible.
 */
export const useSignal = ({ pollMs, enabled = true }: PollOptions = {}): ApiQuery<SignalBoard> =>
  useApiQuery({ ...signalQueryOptions(pollMs), enabled })
