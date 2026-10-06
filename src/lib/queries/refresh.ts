import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { broadcastInvalidate } from '@/lib/tabs/tab-sync'
import { qk } from './keys'

/**
 * Marks queries stale here and in every other open tab (the broadcast is a no-op when the lab setting `tabSync`
 * is off, which is how you watch two tabs disagree). Not awaited on purpose: a mutation should settle when the
 * write did, not when the follow-up refetches have finished.
 */
export function invalidateEverywhere(qc: QueryClient, keys: readonly QueryKey[]): void {
  for (const queryKey of keys) {
    void qc.invalidateQueries({ queryKey })
    broadcastInvalidate(queryKey)
  }
}

/** Everything a dispatch write can change the answer to. */
export const DISPATCH_DEPENDENTS: readonly QueryKey[] = [qk.dispatches(), qk.inbox(), qk.digests()]
