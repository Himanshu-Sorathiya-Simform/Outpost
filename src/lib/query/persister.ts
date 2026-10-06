import type { Query } from '@tanstack/react-query'
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'
import { createStore, del, get, set, type UseStore } from 'idb-keyval'
import { create } from 'zustand'
import { z } from 'zod'
import { AppError } from '@/lib/errors/app-error'
import { errorCenter } from '@/lib/errors/center'
import { formatZodIssues } from '@/lib/errors/normalize'
import { getLabSettings, type LabSettingValues, type RqBuster } from '@/lib/settings/lab-settings'
import { queryClient } from './client'

export const PERSIST_DB = 'outpost-query'
export const PERSIST_STORE = 'cache'
export const PERSIST_KEY = 'react-query'
export const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const PERSIST_THROTTLE_MS = 1000

/** Query-key roots that must never be written to disk: lab instruments read live state, the session is a cookie's shadow. */
const NEVER_PERSIST: ReadonlySet<unknown> = new Set(['lab', 'session'])

export interface PersistStatus {
  /** What the setting said when the page loaded. Changing it only takes effect on the next reload. */
  enabled: boolean
  restoredAt: number | null
  restoredQueries: number
  lastPersistAt: number | null
  lastError: string | null
  /** The record found at load was rejected (corrupt, or failed to hydrate) and deleted. */
  rejected: boolean
}

export const usePersistStatus = create<PersistStatus>(() => ({
  enabled: false,
  restoredAt: null,
  restoredQueries: 0,
  lastPersistAt: null,
  lastError: null,
  rejected: false,
}))

/** Only successful queries are worth restoring; errors and pending fetches would resurrect as noise. */
export function shouldDehydrateQuery(query: Pick<Query, 'queryKey' | 'state'>): boolean {
  return query.state.status === 'success' && !NEVER_PERSIST.has(query.queryKey[0])
}

/**
 * TanStack's default persists mutations that are paused (offline). They could only be resumed after a reload if a
 * mutationFn had been registered for their key, and none is: the restored mutation would fail with "No mutationFn
 * found". Queued writes belong in the outbox (src/pwa/sync.ts), not here.
 */
export const shouldDehydrateMutation = (): boolean => false

/** The string stored next to the cache. A mismatch on restore throws the whole cache away. */
export function resolveBuster(mode: RqBuster, version: string = __APP_VERSION__, buildId: string = __BUILD_ID__): string {
  if (mode === 'version') return `v${version}`
  if (mode === 'build') return `b${buildId}`
  return ''
}

// Shape check only (not the data): enough to be sure hydrate() will not choke on a hand-edited or truncated record.
const PersistedClientShape = z.object({
  timestamp: z.number(),
  buster: z.string(),
  clientState: z.object({
    mutations: z.array(z.unknown()),
    queries: z.array(
      z.looseObject({
        queryKey: z.array(z.unknown()),
        queryHash: z.string(),
        state: z.looseObject({ status: z.string(), dataUpdatedAt: z.number() }),
      }),
    ),
  }),
})

let store: UseStore | undefined
const idb = (): UseStore => {
  if (typeof indexedDB === 'undefined') throw new AppError({ kind: 'unsupported', message: 'IndexedDB is not available, so the query cache cannot be persisted' })
  // createStore opens the database immediately, so it is created on first use and not at import.
  return (store ??= createStore(PERSIST_DB, PERSIST_STORE))
}

function noteError(err: unknown, source: string): void {
  const error = errorCenter.report(err, { source, silent: true })
  usePersistStatus.setState({ lastError: error.message })
}

/** An IndexedDB persister with a trailing throttle and a validated, self-healing restore. */
export function createIdbPersister(throttleMs: number = PERSIST_THROTTLE_MS): Persister {
  let latest: PersistedClient | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = async (): Promise<void> => {
    timer = null
    const client = latest
    latest = null
    if (!client) return
    try {
      await set(PERSIST_KEY, client, idb())
      usePersistStatus.setState({ lastPersistAt: Date.now(), lastError: null })
    } catch (err) {
      noteError(err, 'query-persist:write')
    }
  }

  const removeClient = async (): Promise<void> => {
    latest = null
    if (timer) clearTimeout(timer)
    timer = null
    try {
      await del(PERSIST_KEY, idb())
    } catch (err) {
      noteError(err, 'query-persist:remove')
    }
  }

  return {
    persistClient(client) {
      latest = client
      timer ??= setTimeout(() => void flush(), throttleMs)
    },
    async restoreClient() {
      let raw: unknown
      try {
        raw = await get(PERSIST_KEY, idb())
      } catch (err) {
        noteError(err, 'query-persist:read')
        return undefined
      }
      if (raw === undefined) return undefined

      const shape = PersistedClientShape.safeParse(raw)
      if (!shape.success) {
        const issues = formatZodIssues(shape.error.issues)
        noteError(new AppError({ kind: 'schema-mismatch', message: `Persisted query cache is corrupt (${issues[0]}). It was deleted.`, context: { issues } }), 'query-persist:restore')
        usePersistStatus.setState({ rejected: true })
        await removeClient()
        return undefined
      }
      // The shape is verified above; the dehydrated payload itself is opaque to us and is checked by hydrate().
      return raw as PersistedClient
    },
    removeClient,
  }
}

export interface PersistConfig {
  persistOptions: {
    persister: Persister
    maxAge: number
    buster: string
    dehydrateOptions: { shouldDehydrateQuery: typeof shouldDehydrateQuery; shouldDehydrateMutation: typeof shouldDehydrateMutation }
  }
  onSuccess: () => void
  onError: () => void
}

/**
 * Props for PersistQueryClientProvider, or `null` when persistence is switched off (the default).
 * Read once at startup: the lab setting applies on reload because hydration happens before the first render.
 *
 *   const persist = getPersistConfig()
 *   persist ? <PersistQueryClientProvider client={queryClient} {...persist}>…</…> : <QueryClientProvider client={queryClient}>…</…>
 */
export function getPersistConfig(settings: LabSettingValues = getLabSettings()): PersistConfig | null {
  usePersistStatus.setState({ enabled: settings.persistQueryCache })
  if (!settings.persistQueryCache) return null
  return {
    persistOptions: {
      persister: createIdbPersister(),
      maxAge: PERSIST_MAX_AGE_MS,
      buster: resolveBuster(settings.rqBuster),
      dehydrateOptions: { shouldDehydrateQuery, shouldDehydrateMutation },
    },
    onSuccess: () => usePersistStatus.setState({ restoredAt: Date.now(), restoredQueries: queryClient.getQueryCache().getAll().length }),
    // TanStack has already deleted the persisted cache by the time this runs. The provider passes no error object.
    onError: () => {
      usePersistStatus.setState({ rejected: true })
      noteError(new AppError({ kind: 'schema-mismatch', message: 'Restoring the persisted query cache failed. It was deleted.' }), 'query-persist:hydrate')
    },
  }
}

export interface PersistedCacheInfo {
  timestamp: number
  buster: string
  queryCount: number
  /** Approximate: size of the JSON form, which is what a learner cares about. */
  approxBytes: number
}

/** What is on disk right now (null: nothing, or unreadable). For the Lab → Query page. */
export async function readPersistedCacheInfo(): Promise<PersistedCacheInfo | null> {
  try {
    const raw = await get(PERSIST_KEY, idb())
    const shape = PersistedClientShape.safeParse(raw)
    if (!shape.success) return null
    return {
      timestamp: shape.data.timestamp,
      buster: shape.data.buster,
      queryCount: shape.data.clientState.queries.length,
      approxBytes: JSON.stringify(raw).length,
    }
  } catch {
    return null
  }
}

export async function clearPersistedCache(): Promise<void> {
  try {
    await del(PERSIST_KEY, idb())
  } catch (err) {
    noteError(err, 'query-persist:clear')
  }
}

/** Lab experiment: write garbage where the cache lives, then reload and watch the recovery path delete it. */
export async function corruptPersistedCache(): Promise<void> {
  try {
    await set(PERSIST_KEY, { timestamp: 'yesterday', clientState: 'not a dehydrated state' }, idb())
  } catch (err) {
    noteError(err, 'query-persist:corrupt')
  }
}
