import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { answers } from '@/outbox/outbox-test-helpers'
import { list } from '@/outbox/store'
import { PwaApi } from './types'

/**
 * Exercise 17, "Unsupported browsers": every seam, in a browser that has none of the APIs (what Firefox and Safari come close to), does what
 * docs/LEARNING.md lists instead of crashing. The stand-in browser has an empty `navigator`, no Notification, no PushManager, no
 * ServiceWorkerRegistration, no SyncManager, no storage API; IndexedDB and fetch exist (every browser has them).
 */

const names = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise
    return 'resolved'
  } catch (error) {
    return error instanceof Error ? error.name : String(error)
  }
}

let seams: PwaApi

beforeEach(async () => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.stubGlobal('navigator', {})
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('fetch', vi.fn(async () => answers.created()))
  vi.stubGlobal('BroadcastChannel', class { postMessage(): void {} close(): void {} })
  const [{ registration }, { install }, { notifications }, { sync }, { periodicSync }, { badge }, { share }] = await Promise.all([
    import('./registration'),
    import('./install'),
    import('./notifications'),
    import('./sync'),
    import('./periodic-sync'),
    import('./badge'),
    import('./share'),
  ])
  seams = { registration, install, notifications, sync, periodicSync, badge, share }
})

describe('a browser with none of the APIs', () => {
  it('registration.register returns without registering, and the store says there is no worker', async () => {
    await expect(seams.registration.register()).resolves.toBeUndefined()
    const { usePwaStore } = await import('./store')
    expect(usePwaStore.getState()).toMatchObject({ swRegistered: false, swState: 'none', updateAvailable: false })
  })

  it('registration.checkForUpdate and applyUpdate throw NotSupportedError, which the page words as "This browser does not offer that."', async () => {
    expect(await names(seams.registration.checkForUpdate())).toBe('NotSupportedError')
    expect(await names(seams.registration.applyUpdate())).toBe('NotSupportedError')
  })

  it('registration.unregister resolves false: there was nothing to remove', async () => {
    await expect(seams.registration.unregister()).resolves.toBe(false)
  })

  it('install.prompt returns "unavailable"', async () => {
    await expect(seams.install.prompt()).resolves.toBe('unavailable')
  })

  it('notifications.permission says "unsupported" (Settings disables the buttons), and requesting it throws NotSupportedError instead of inventing a grant', async () => {
    expect(seams.notifications.permission()).toBe('unsupported')
    expect(await names(seams.notifications.requestPermission())).toBe('NotSupportedError')
  })

  it('notifications.subscribePush throws NotSupportedError, getSubscription resolves null, unsubscribePush and showLocal do not crash', async () => {
    expect(await names(seams.notifications.subscribePush())).toBe('NotSupportedError')
    await expect(seams.notifications.getSubscription()).resolves.toBeNull()
    await expect(seams.notifications.unsubscribePush()).resolves.toBeUndefined()
    expect(['NotSupportedError', 'InvalidStateError']).toContain(await names(seams.notifications.showLocal('Test')))
  })

  it('sync.queueDispatch still stores the dispatch (there is no SyncManager to register), and flushNow sends it from the page', async () => {
    const input = { clientId: 'cid-00000042', stationId: 'KRN-07', title: 'Power dip', body: 'Bus B sagged', severity: 'urgent' as const }
    await expect(seams.sync.queueDispatch(input)).resolves.toMatchObject({ id: 'cid-00000042', status: 'queued' })
    expect(await list()).toHaveLength(1)
    await seams.sync.flushNow()
    expect(await list()).toHaveLength(0)
  })

  it('periodicSync: isSupported is false, register throws NotSupportedError, unregister and list do not crash, and list is empty', async () => {
    expect(seams.periodicSync.isSupported()).toBe(false)
    expect(await names(seams.periodicSync.register('digest-refresh', 3_600_000))).toBe('NotSupportedError')
    await expect(seams.periodicSync.unregister('digest-refresh')).resolves.toBeUndefined()
    await expect(seams.periodicSync.list()).resolves.toEqual([])
  })

  it('badge.set and badge.clear throw NotSupportedError', async () => {
    expect(await names(seams.badge.set(3))).toBe('NotSupportedError')
    expect(await names(seams.badge.clear())).toBe('NotSupportedError')
  })

  it('share.canShare is false (the page shows Copy link) and share resolves "unsupported"', async () => {
    expect(seams.share.canShare({ url: 'https://example.com' })).toBe(false)
    await expect(seams.share.share({ url: 'https://example.com' })).resolves.toBe('unsupported')
  })
})
