import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OutboxItem } from '@shared/sw-protocol'
import { item } from './outbox-test-helpers'
import { addIfAbsent, list, markFailed, remove, save } from './store'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})

describe('the outbox store', () => {
  it('stores a record that the page can read back and that matches the OutboxItem schema', async () => {
    await addIfAbsent(item('cid-00000001'))
    const [stored] = await list()
    expect(OutboxItem.safeParse(stored).success).toBe(true)
    expect(stored).toMatchObject({ id: 'cid-00000001', status: 'queued', attempts: 0, lastError: null })
  })

  it('keeps one record when the same id is queued twice, and returns the stored one', async () => {
    await addIfAbsent(item('cid-00000001', { createdAt: '2026-01-01T00:00:00.000Z' }))
    const second = await addIfAbsent(item('cid-00000001', { createdAt: '2026-02-02T00:00:00.000Z' }))
    expect(await list()).toHaveLength(1)
    expect(second.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('does not reset a record that is already being sent', async () => {
    await addIfAbsent(item('cid-00000001'))
    await save(item('cid-00000001', { status: 'sending', attempts: 3 }))
    const again = await addIfAbsent(item('cid-00000001'))
    expect(again).toMatchObject({ status: 'sending', attempts: 3 })
  })

  it('lists the oldest first', async () => {
    await addIfAbsent(item('cid-00000002', { createdAt: '2026-01-02T00:00:00.000Z' }))
    await addIfAbsent(item('cid-00000001', { createdAt: '2026-01-01T00:00:00.000Z' }))
    await addIfAbsent(item('cid-00000003', { createdAt: '2026-01-03T00:00:00.000Z' }))
    expect((await list()).map((i) => i.id)).toEqual(['cid-00000001', 'cid-00000002', 'cid-00000003'])
  })

  it('is empty on a database that has never been used', async () => {
    expect(await list()).toEqual([])
  })

  it('removes one record, and a missing id is not an error', async () => {
    await addIfAbsent(item('cid-00000001'))
    await addIfAbsent(item('cid-00000002'))
    await remove('cid-00000001')
    await remove('cid-99999999')
    expect((await list()).map((i) => i.id)).toEqual(['cid-00000002'])
  })

  it('marks records failed with a reason and keeps their payload, skipping ids that are gone', async () => {
    await addIfAbsent(item('cid-00000001'))
    await markFailed(['cid-00000001', 'cid-99999999'], 'Gave up')
    const [stored] = await list()
    expect(stored).toMatchObject({ status: 'failed', lastError: 'Gave up' })
    expect(stored?.payload.title).toBe('Dispatch cid-00000001')
    expect(await list()).toHaveLength(1)
  })

  it('uses the database and store of the contract, with `id` as the key path', async () => {
    await addIfAbsent(item('cid-00000001'))
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('outpost-outbox')
      request.onsuccess = () => resolve(request.result)
    })
    const store = database.transaction('outbox').objectStore('outbox')
    expect(store.keyPath).toBe('id')
    database.close()
  })
})
