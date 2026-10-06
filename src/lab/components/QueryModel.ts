import { useEffect, useState } from 'react'
import type { Query, QueryKey } from '@tanstack/react-query'
import { AppError, type ResponseMeta } from '@/lib'

/** A cache can change many times a second while data streams in. The page redraws at most this often. */
export const CACHE_REFRESH_MS = 250

/**
 * Bumps a counter when a cache announces a change, but never more than four times a second.
 * Reading the cache during render then always sees the latest state, because the caches are mutable stores.
 */
export function useCacheTick(subscribe: (listener: () => void) => () => void): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = subscribe(() => {
      timer ??= setTimeout(() => {
        timer = null
        setTick((t) => t + 1)
      }, CACHE_REFRESH_MS)
    })
    return () => {
      off()
      if (timer) clearTimeout(timer)
    }
  }, [subscribe])
  return tick
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A readable key: strings as they are, everything else as compact JSON, joined with slashes. */
export function formatKey(key: QueryKey): string {
  return key.map((part) => (typeof part === 'string' ? part : (JSON.stringify(part) ?? String(part)))).join(' / ')
}

/** Lower-cased and with the spaces around separators removed, so "dispatches/feed" and "dispatches / feed" mean the same. */
const squash = (text: string): string => text.toLowerCase().replace(/\s*\/\s*/g, '/').trim()

export const matchesPrefix = (keyText: string, prefix: string): boolean => squash(keyText).startsWith(squash(prefix))

const sizes = new WeakMap<object, number | null>()

/** Characters in the JSON form of the cached value: what the persister would write, give or take. Cached per object, since a query replaces its data object on every update. */
export function approxSize(data: unknown): number | null {
  if (data === undefined) return null
  if (typeof data !== 'object' || data === null) return JSON.stringify(data)?.length ?? null
  if (sizes.has(data)) return sizes.get(data) ?? null
  let size: number | null
  try {
    size = JSON.stringify(data).length
  } catch {
    size = null
  }
  sizes.set(data, size)
  return size
}

export type QueryState = 'all' | 'fetching' | 'stale' | 'fresh' | 'error' | 'inactive' | 'paused'

export interface QueryRowData {
  hash: string
  key: QueryKey
  keyText: string
  status: Query['state']['status']
  fetchStatus: Query['state']['fetchStatus']
  stale: boolean
  observers: number
  updatedAt: number
  errorUpdateCount: number
  /** `meta.url`: the API path the service worker bridge matches on. */
  url: string | null
  bytes: number | null
  error: AppError | null
  /** False for an entry restored from disk that no screen has mounted yet: there is nothing to refetch it with. */
  refetchable: boolean
}

export function describeQuery(query: Query): QueryRowData {
  const { state } = query
  const url = query.meta?.url
  return {
    hash: query.queryHash,
    key: query.queryKey,
    keyText: formatKey(query.queryKey),
    status: state.status,
    fetchStatus: state.fetchStatus,
    stale: query.isStale(),
    observers: query.getObserversCount(),
    updatedAt: state.dataUpdatedAt,
    errorUpdateCount: state.errorUpdateCount,
    url: typeof url === 'string' ? url : null,
    bytes: approxSize(state.data),
    error: AppError.is(state.error) ? state.error : null,
    refetchable: typeof query.options.queryFn === 'function',
  }
}

export function matchesState(row: QueryRowData, state: QueryState): boolean {
  switch (state) {
    case 'all':
      return true
    case 'fetching':
      return row.fetchStatus === 'fetching'
    case 'paused':
      return row.fetchStatus === 'paused'
    case 'stale':
      return row.status === 'success' && row.stale
    case 'fresh':
      return row.status === 'success' && !row.stale
    case 'error':
      return row.status === 'error'
    case 'inactive':
      return row.observers === 0
  }
}

const isResponseMeta = (value: unknown): value is ResponseMeta =>
  isRecord(value) && typeof value.url === 'string' && typeof value.status === 'number' && typeof value.source === 'string' && typeof value.fetchedAt === 'string'

const metaOf = (value: unknown): ResponseMeta | null => (isRecord(value) && isResponseMeta(value.meta) ? value.meta : null)

/**
 * The provenance records inside a cached value. Every data query stores a whole ApiResult ({ data, meta });
 * an infinite query stores { pages: ApiResult[] }, one record per page. Anything else (a hand-written entry) has none.
 */
export function responseMetas(data: unknown): ResponseMeta[] {
  const single = metaOf(data)
  if (single) return [single]
  if (isRecord(data) && Array.isArray(data.pages)) return data.pages.flatMap((page: unknown) => metaOf(page) ?? [])
  return []
}

/** Pages held by an infinite query, or null for a plain one. */
export const countPages = (data: unknown): number | null => (isRecord(data) && Array.isArray(data.pages) ? data.pages.length : null)
