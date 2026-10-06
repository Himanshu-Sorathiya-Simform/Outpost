import { queryOptions, useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import {
  API,
  type PushSendResult,
  type PushSubscriptionList,
  type PushUnsubscribeRequest,
  type PushUnsubscribeResult,
} from '@shared/contracts'
import type { ApiResult } from '@/lib/api/types'
import type { AppError } from '@/lib/errors/app-error'
import * as endpoints from './endpoints'
import { qk } from './keys'
import { useApiQuery, type ApiQuery } from './shared'

export const pushVapidQueryOptions = () =>
  queryOptions({
    queryKey: qk.push.vapid(),
    queryFn: ({ signal }) => endpoints.getPushVapid({ signal }),
    // The key pair is generated once and kept on disk by the server.
    staleTime: 10 * 60_000,
    meta: { url: API.pushVapid },
  })

export const pushSubscriptionsQueryOptions = () =>
  queryOptions({
    queryKey: qk.push.subscriptions(),
    queryFn: ({ signal }) => endpoints.getPushSubscriptions({ signal }),
    staleTime: 0,
    meta: { url: API.pushSubscriptions },
  })

/** The server's VAPID public key (base64url), which pushManager.subscribe needs as applicationServerKey. */
export const usePushVapid = (): ApiQuery<endpoints.PushVapidInfo> => useApiQuery(pushVapidQueryOptions())

/** Every browser the server can push to, with the result of the last send to each. */
export const usePushSubscriptions = (): ApiQuery<PushSubscriptionList> => useApiQuery(pushSubscriptionsQueryOptions())

/** Sends a push to every subscription (or one, via `targetEndpointTail`). Resolves with per-subscription results and the payload built. */
export function useSendPush(): UseMutationResult<ApiResult<PushSendResult>, AppError, endpoints.PushSendInput> {
  const qc = useQueryClient()
  return useMutation<ApiResult<PushSendResult>, AppError, endpoints.PushSendInput>({
    mutationKey: ['push', 'send'],
    mutationFn: (request) => endpoints.sendPush(request),
    // A send records lastResult per subscription and prunes dead ones.
    onSettled: () => qc.invalidateQueries({ queryKey: qk.push.subscriptions() }),
  })
}

/** Removes a subscription from the server's list by id (from usePushSubscriptions) or by endpoint URL. Does not touch the browser's own subscription. */
export function useRemovePushSubscription(): UseMutationResult<ApiResult<PushUnsubscribeResult>, AppError, PushUnsubscribeRequest> {
  const qc = useQueryClient()
  return useMutation<ApiResult<PushUnsubscribeResult>, AppError, PushUnsubscribeRequest>({
    mutationKey: ['push', 'unsubscribe'],
    mutationFn: (request) => endpoints.unsubscribePush(request),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.push.subscriptions() }),
  })
}
