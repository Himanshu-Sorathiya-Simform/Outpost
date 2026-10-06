import { queryOptions, useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import { API, type Session, type SessionResponse } from '@shared/contracts'
import type { ApiResult } from '@/lib/api/types'
import type { AppError } from '@/lib/errors/app-error'
import { broadcastSessionChanged } from '@/lib/tabs/tab-sync'
import { useNow } from './clock'
import * as endpoints from './endpoints'
import { qk } from './keys'
import { sessionPrompt } from './session-prompt'
import { useApiQuery, type ApiQuery } from './shared'

export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: qk.session(),
    queryFn: ({ signal }) => endpoints.getSession({ signal }),
    // The cookie is the truth and it can expire at any moment. `persist: false` is documentation for the
    // persister's rule (the 'session' root is never written to disk): a restored "signed in" would be a lie.
    staleTime: 0,
    meta: { url: API.session, persist: false },
  })

/** Who is clocked in. `data.session` is null when signed out; `data` itself is undefined until the first answer. */
export const useSession = (): ApiQuery<SessionResponse> => useApiQuery(sessionQueryOptions())

/** Sign in under a callsign (2-16 letters, digits, dashes). The server sets the cookie; other tabs are told to refetch. */
export function useClockIn(): UseMutationResult<ApiResult<SessionResponse>, AppError, { callsign: string }> {
  const qc = useQueryClient()
  return useMutation<ApiResult<SessionResponse>, AppError, { callsign: string }>({
    mutationKey: ['session', 'clock-in'],
    mutationFn: ({ callsign }) => endpoints.createSession(callsign),
    onSuccess: (result) => {
      qc.setQueryData<ApiResult<SessionResponse>>(qk.session(), result)
      sessionPrompt.close()
      broadcastSessionChanged()
    },
  })
}

export function useClockOut(): UseMutationResult<ApiResult<SessionResponse>, AppError, void> {
  const qc = useQueryClient()
  return useMutation<ApiResult<SessionResponse>, AppError, void>({
    mutationKey: ['session', 'clock-out'],
    mutationFn: () => endpoints.deleteSession(),
    onSuccess: (result) => {
      qc.setQueryData<ApiResult<SessionResponse>>(qk.session(), result)
      broadcastSessionChanged()
    },
  })
}

export interface SessionTimeLeft {
  /** The session being counted down; null when signed out or not loaded yet. */
  session: Session | null
  /** Epoch ms. */
  expiresAt: number | null
  /** Clamped at 0. */
  msLeft: number | null
  /** Whole seconds, rounded up, so the last second reads 1 and never 0 before expiry. */
  secondsLeft: number | null
  /** The expiry time has passed on this device's clock. The session is refetched once when that happens. */
  expired: boolean
  /** 'm:ss' (or 'h:mm:ss'), for display. */
  label: string | null
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/**
 * Countdown to the session's `expiresAt`, ticking once a second. Uses this device's clock, so a skewed clock
 * shows a skewed countdown; the server's clock decides what is actually valid. When the time runs out the session
 * query is refetched once, which turns the UI to signed-out if the server agrees.
 */
export function useSessionTimeLeft(): SessionTimeLeft {
  const qc = useQueryClient()
  const session = useSession().data?.session ?? null
  const now = useNow()
  const expiresAt = session ? Date.parse(session.expiresAt) : null
  const msLeft = expiresAt === null ? null : Math.max(0, expiresAt - now)
  const expired = expiresAt !== null && now >= expiresAt

  useEffect(() => {
    if (expired) void qc.invalidateQueries({ queryKey: qk.session() })
  }, [expired, expiresAt, qc])

  return {
    session,
    expiresAt,
    msLeft,
    secondsLeft: msLeft === null ? null : Math.ceil(msLeft / 1000),
    expired,
    label: msLeft === null ? null : formatCountdown(msLeft),
  }
}
