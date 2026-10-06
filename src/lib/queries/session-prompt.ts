import type { QueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { qk } from './keys'

/**
 * Whether the "clock in" dialog should be showing. The shell renders the dialog; the data layer opens it when a
 * request fails with 401. `reason` is finished copy for the dialog body, or null for the generic wording.
 */
export interface SessionPromptState {
  open: boolean
  reason: string | null
}

export const useSessionPrompt = create<SessionPromptState>(() => ({ open: false, reason: null }))

/** Imperative handle for non-React code (mutation callbacks) and for any button that wants the dialog. */
export const sessionPrompt = {
  open: (reason: string | null = null): void => useSessionPrompt.setState({ open: true, reason }),
  close: (): void => useSessionPrompt.setState({ open: false, reason: null }),
}

/**
 * A 401 means the session behind the cookie is gone. Ask the operator to clock in again, and refetch the session
 * so the rest of the UI stops believing it is still signed in.
 */
export function onUnauthorized(qc: QueryClient, reason: string | null): void {
  sessionPrompt.open(reason)
  void qc.invalidateQueries({ queryKey: qk.session() })
}
