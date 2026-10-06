// @vitest-environment jsdom
import { QueryClient, dehydrate, onlineManager } from '@tanstack/react-query'
import { persistQueryClientRestore } from '@tanstack/react-query-persist-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorCenter, useErrorCenter } from '@/lib/errors/center'
import { LAB_SETTING_DEFAULTS } from '@/lib/settings/lab-settings'

const disk = new Map<string, unknown>()
const ops = { fail: null as null | Error }
vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: (key: string) => (ops.fail ? Promise.reject(ops.fail) : Promise.resolve(disk.get(key))),
  set: (key: string, value: unknown) => (ops.fail ? Promise.reject(ops.fail) : Promise.resolve(void disk.set(key, value))),
  del: (key: string) => Promise.resolve(void disk.delete(key)),
}))

const persister = await import('./persister')
const { PERSIST_KEY, PERSIST_MAX_AGE_MS, clearPersistedCache, corruptPersistedCache, createIdbPersister, getPersistConfig, readPersistedCacheInfo, resolveBuster, shouldDehydrateQuery, usePersistStatus } = persister

beforeEach(() => {
  disk.clear()
  ops.fail = null
  errorCenter.clear()
  vi.stubGlobal('indexedDB', {})
  usePersistStatus.setState({ enabled: false, restoredAt: null, restoredQueries: 0, lastPersistAt: null, lastError: null })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function populatedClient(): QueryClient {
  const client = new QueryClient()
  client.setQueryData(['dispatches', 'list'], { items: [1, 2, 3] })
  client.setQueryData(['lab', 'state'], { secret: 'live' })
  client.setQueryData(['session'], { session: null })
  return client
}

const snapshot = (buster = 'v1.0.0', timestamp = Date.now()) => ({ timestamp, buster, clientState: dehydrate(populatedClient(), { shouldDehydrateQuery }) })

describe('dehydrate filter', () => {
  it('keeps successful queries and drops lab, session, failed and pending ones', () => {
    const client = populatedClient()
    void client.fetchQuery({ queryKey: ['stations'], queryFn: () => Promise.reject(new Error('x')), retry: false }).catch(() => undefined)
    void client.prefetchQuery({ queryKey: ['pending'], queryFn: () => new Promise(() => undefined) })
    const kept = dehydrate(client, { shouldDehydrateQuery }).queries.map((q) => q.queryKey[0])
    expect(kept).toEqual(['dispatches'])
  })
})

describe('buster modes', () => {
  it('follows the setting', () => {
    expect(resolveBuster('version', '1.2.3', 'abc')).toBe('v1.2.3')
    expect(resolveBuster('build', '1.2.3', 'abc')).toBe('babc')
    expect(resolveBuster('none', '1.2.3', 'abc')).toBe('')
  })
})

describe('getPersistConfig', () => {
  it('is null by default and records that persistence is off', () => {
    expect(getPersistConfig(LAB_SETTING_DEFAULTS)).toBeNull()
    expect(usePersistStatus.getState().enabled).toBe(false)
  })

  it('builds provider props when enabled', () => {
    const config = getPersistConfig({ ...LAB_SETTING_DEFAULTS, persistQueryCache: true, rqBuster: 'none' })
    expect(config?.persistOptions).toMatchObject({ maxAge: PERSIST_MAX_AGE_MS, buster: '' })
    expect(config?.persistOptions.dehydrateOptions.shouldDehydrateQuery).toBe(shouldDehydrateQuery)
    expect(usePersistStatus.getState().enabled).toBe(true)
  })
})

describe('paused mutations', () => {
  it('are never written to disk: nothing would know how to resume them after a reload', async () => {
    const config = getPersistConfig({ ...LAB_SETTING_DEFAULTS, persistQueryCache: true })
    const client = new QueryClient()
    onlineManager.setOnline(false)
    try {
      const mutation = client.getMutationCache().build(client, { mutationKey: ['dispatch', 'patch'], mutationFn: async () => 'sent' })
      void mutation.execute({ id: 'dp-000001' }).catch(() => undefined)
      await Promise.resolve()
      expect(mutation.state.isPaused).toBe(true)
      // TanStack's default would keep this one: it dehydrates exactly the paused mutations.
      expect(dehydrate(client).mutations).toHaveLength(1)
      expect(dehydrate(client, config?.persistOptions.dehydrateOptions).mutations).toHaveLength(0)
    } finally {
      onlineManager.setOnline(true)
      client.clear()
    }
  })
})

describe('idb persister', () => {
  it('writes the latest snapshot after the throttle window, once', async () => {
    vi.useFakeTimers()
    const p = createIdbPersister(1000)
    p.persistClient(snapshot('first'))
    p.persistClient(snapshot('second'))
    expect(disk.size).toBe(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(disk.size).toBe(1)
    expect((disk.get(PERSIST_KEY) as { buster: string }).buster).toBe('second')
    expect(usePersistStatus.getState().lastPersistAt).not.toBeNull()
  })

  it('restores a valid snapshot through TanStack and hydrates the client', async () => {
    disk.set(PERSIST_KEY, snapshot('v1'))
    const client = new QueryClient()
    await persistQueryClientRestore({ queryClient: client, persister: createIdbPersister(), buster: 'v1', maxAge: PERSIST_MAX_AGE_MS })
    expect(client.getQueryData(['dispatches', 'list'])).toEqual({ items: [1, 2, 3] })
    expect(client.getQueryData(['lab', 'state'])).toBeUndefined()
  })

  it('discards a snapshot with another buster or older than maxAge', async () => {
    const client = new QueryClient()
    disk.set(PERSIST_KEY, snapshot('old-version'))
    await persistQueryClientRestore({ queryClient: client, persister: createIdbPersister(), buster: 'new-version' })
    expect(disk.has(PERSIST_KEY)).toBe(false)
    disk.set(PERSIST_KEY, snapshot('v1', Date.now() - PERSIST_MAX_AGE_MS - 1000))
    await persistQueryClientRestore({ queryClient: client, persister: createIdbPersister(), buster: 'v1' })
    expect(disk.has(PERSIST_KEY)).toBe(false)
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })

  it.each([
    ['garbage', 'not an object'],
    ['missing state', { timestamp: 1, buster: 'v1' }],
    ['wrong types', { timestamp: 'yesterday', buster: 1, clientState: { queries: 'nope', mutations: [] } }],
    ['malformed query', { timestamp: 1, buster: 'v1', clientState: { mutations: [], queries: [{ queryKey: 'x' }] } }],
  ])('recovers from a corrupt snapshot (%s): reports it, deletes it, restores nothing', async (_name, corrupt) => {
    disk.set(PERSIST_KEY, corrupt)
    const restored = await createIdbPersister().restoreClient()
    expect(restored).toBeUndefined()
    expect(disk.has(PERSIST_KEY)).toBe(false)
    expect(useErrorCenter.getState().records[0]?.error.kind).toBe('schema-mismatch')
    expect(usePersistStatus.getState().lastError).toMatch(/corrupt/)
  })

  it('reports read and write failures without throwing', async () => {
    ops.fail = new DOMException('disk full', 'QuotaExceededError')
    expect(await createIdbPersister().restoreClient()).toBeUndefined()
    vi.useFakeTimers()
    const p = createIdbPersister(10)
    p.persistClient(snapshot())
    await vi.advanceTimersByTimeAsync(10)
    expect(useErrorCenter.getState().counts.quota).toBe(2)
  })

  it('says so when IndexedDB does not exist', async () => {
    vi.stubGlobal('indexedDB', undefined)
    expect(await createIdbPersister().restoreClient()).toBeUndefined()
    expect(useErrorCenter.getState().records[0]?.error.kind).toBe('unsupported')
  })

  it('onSuccess and onError update the status store', () => {
    const config = getPersistConfig({ ...LAB_SETTING_DEFAULTS, persistQueryCache: true })
    config?.onSuccess()
    expect(usePersistStatus.getState().restoredAt).not.toBeNull()
    config?.onError()
    expect(usePersistStatus.getState().lastError).toMatch(/Restoring/)
  })
})

describe('lab helpers', () => {
  it('reports what is on disk, clears it, and can corrupt it on purpose', async () => {
    expect(await readPersistedCacheInfo()).toBeNull()
    disk.set(PERSIST_KEY, snapshot('v9'))
    expect(await readPersistedCacheInfo()).toMatchObject({ buster: 'v9', queryCount: 1 })
    await corruptPersistedCache()
    expect(await readPersistedCacheInfo()).toBeNull()
    expect(disk.has(PERSIST_KEY)).toBe(true)
    await clearPersistedCache()
    expect(disk.has(PERSIST_KEY)).toBe(false)
  })
})
