import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OutboxItem } from '@shared/sw-protocol'
import { answers, item } from '@/outbox/outbox-test-helpers'
import { list } from '@/outbox/store'
import { setPwa, usePwaStore } from './store'
import { sync } from './sync'

const INPUT = { clientId: 'cid-00000001', stationId: 'KRN-07', title: 'Power dip', body: 'Bus B sagged', severity: 'urgent' as const }

let register: ReturnType<typeof vi.fn>
let fetchMock: ReturnType<typeof vi.fn>
let posted: Array<{ channel: string; message: unknown }>

function stubBrowser(options: { syncManager?: boolean; registration?: boolean } = {}) {
  const { syncManager = true, registration = true } = options
  register = vi.fn(async () => undefined)
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: async () => (registration ? (syncManager ? { sync: { register } } : {}) : undefined) },
  })
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  fetchMock = vi.fn(async () => answers.created())
  vi.stubGlobal('fetch', fetchMock)
  posted = []
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      constructor(private readonly name: string) {}
      postMessage(message: unknown): void {
        posted.push({ channel: this.name, message })
      }
      close(): void {}
    },
  )
  stubBrowser()
  setPwa({ queuedCount: 0 })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sync.queueDispatch', () => {
  it('stores a record that matches the OutboxItem schema: id = clientId, an ISO createdAt, attempts 0, queued, no error', async () => {
    const stored = await sync.queueDispatch(INPUT)
    expect(OutboxItem.safeParse(stored).success).toBe(true)
    expect(stored).toMatchObject({ id: 'cid-00000001', attempts: 0, status: 'queued', lastError: null })
    expect(new Date(stored.createdAt).toISOString()).toBe(stored.createdAt)
    expect((await list())[0]).toEqual(stored)
  })

  it('stores the dispatch as the server will read it, with the defaults filled in', async () => {
    const stored = await sync.queueDispatch(INPUT)
    expect(stored.payload).toEqual({ ...INPUT, tags: [], coords: null })
  })

  it('registers the outbox-flush tag', async () => {
    await sync.queueDispatch(INPUT)
    expect(register).toHaveBeenCalledExactlyOnceWith('outbox-flush')
  })

  it('makes one record when the same dispatch is queued twice, and does not reset one that is being sent', async () => {
    await sync.queueDispatch(INPUT)
    const { save } = await import('@/outbox/store')
    await save(item('cid-00000001', { status: 'sending', attempts: 2 }))
    const again = await sync.queueDispatch(INPUT)
    expect(await list()).toHaveLength(1)
    expect(again).toMatchObject({ status: 'sending', attempts: 2 })
    expect(usePwaStore.getState().queuedCount).toBe(1)
  })

  it('keeps queuedCount equal to the number of records', async () => {
    await sync.queueDispatch(INPUT)
    expect(usePwaStore.getState().queuedCount).toBe(1)
    await sync.queueDispatch({ ...INPUT, clientId: 'cid-00000002' })
    expect(usePwaStore.getState().queuedCount).toBe(2)
  })

  it('still stores the record where there is no Background Sync (Safari, Firefox)', async () => {
    stubBrowser({ syncManager: false })
    await sync.queueDispatch(INPUT)
    expect(await list()).toHaveLength(1)
    expect(register).not.toHaveBeenCalled()
  })

  it('still stores the record when no worker is registered', async () => {
    stubBrowser({ registration: false })
    await sync.queueDispatch(INPUT)
    expect(await list()).toHaveLength(1)
  })

  it('still stores the record, and resolves, when register() throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    register.mockRejectedValueOnce(new DOMException('No active worker', 'InvalidStateError'))
    await expect(sync.queueDispatch(INPUT)).resolves.toMatchObject({ id: 'cid-00000001' })
    expect(await list()).toHaveLength(1)
    expect(warn).toHaveBeenCalled()
  })

  it('still stores the record where there is no service worker API at all', async () => {
    vi.stubGlobal('navigator', {})
    await sync.queueDispatch(INPUT)
    expect(await list()).toHaveLength(1)
  })

  it('rejects, and leaves the count alone, when IndexedDB cannot be opened', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request: { onerror?: () => void; error: DOMException } = { error: new DOMException('Denied', 'SecurityError') }
        queueMicrotask(() => request.onerror?.())
        return request
      },
    })
    await expect(sync.queueDispatch(INPUT)).rejects.toMatchObject({ name: 'SecurityError' })
    expect(usePwaStore.getState().queuedCount).toBe(0)
  })
})

describe('sync.listQueued and sync.removeQueued', () => {
  it('lists what is stored, oldest first, and keeps the count honest', async () => {
    await sync.queueDispatch({ ...INPUT, clientId: 'cid-00000002' })
    await sync.queueDispatch(INPUT)
    setPwa({ queuedCount: 99 })
    const items = await sync.listQueued()
    expect(items).toHaveLength(2)
    expect(usePwaStore.getState().queuedCount).toBe(2)
  })

  it('removes one record and recounts; an id that is not there is not an error', async () => {
    await sync.queueDispatch(INPUT)
    await sync.queueDispatch({ ...INPUT, clientId: 'cid-00000002' })
    await sync.removeQueued('cid-00000001')
    await sync.removeQueued('cid-99999999')
    expect((await list()).map((i) => i.id)).toEqual(['cid-00000002'])
    expect(usePwaStore.getState().queuedCount).toBe(1)
  })
})

describe('sync.flushNow', () => {
  it('replays every record, the failed ones too, deletes what the server took, recounts and announces on the channel', async () => {
    await sync.queueDispatch(INPUT)
    const { save } = await import('@/outbox/store')
    await save(item('cid-00000001', { status: 'failed', lastError: 'You are not clocked in' }))
    await sync.flushNow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await list()).toEqual([])
    expect(usePwaStore.getState().queuedCount).toBe(0)
    expect(posted).toEqual([{ channel: 'outpost-sw', message: { type: 'sync-complete', tag: 'outbox-flush', succeeded: ['cid-00000001'], failed: [] } }])
  })

  it('announces what is still waiting as not filed, and keeps the count at what is left', async () => {
    await sync.queueDispatch(INPUT)
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await sync.flushNow()
    expect(usePwaStore.getState().queuedCount).toBe(1)
    expect(posted[0]?.message).toMatchObject({ succeeded: [], failed: ['cid-00000001'] })
  })

  it('says nothing, and sends nothing, when the outbox is empty', async () => {
    await sync.flushNow()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(posted).toEqual([])
  })

  it('does not throw when the platform has no BroadcastChannel', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    await sync.queueDispatch(INPUT)
    await expect(sync.flushNow()).resolves.toBeUndefined()
    expect(await list()).toEqual([])
  })
})
