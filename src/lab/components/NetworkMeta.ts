import { queryClient } from '@/lib'
import type { ResponseMeta } from '@/lib/api/types'

function isMeta(value: unknown): value is ResponseMeta {
  return typeof value === 'object' && value !== null && 'requestId' in value && 'source' in value && 'durationMs' in value
}

function metasIn(data: unknown): ResponseMeta[] {
  if (typeof data !== 'object' || data === null) return []
  if ('meta' in data && isMeta(data.meta)) return [data.meta]
  if ('pages' in data && Array.isArray(data.pages)) return data.pages.flatMap(metasIn)
  return []
}

/**
 * The net log keeps a one-line summary per request; the full ResponseMeta lives next to the data in the React Query
 * cache. Look it up by request id. Mutations and evicted queries have none, and the drawer says so.
 */
export function findMetaByRequestId(requestId: string | null): ResponseMeta | null {
  if (!requestId) return null
  for (const query of queryClient.getQueryCache().getAll()) {
    const hit = metasIn(query.state.data).find((m) => m.requestId === requestId)
    if (hit) return hit
  }
  return null
}
