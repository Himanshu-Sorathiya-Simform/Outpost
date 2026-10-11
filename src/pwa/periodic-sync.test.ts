import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setPwa, usePwaStore } from './store'
import { periodicSync } from './periodic-sync'

let register: ReturnType<typeof vi.fn>
let unregister: ReturnType<typeof vi.fn>
let getTags: ReturnType<typeof vi.fn>
let tags: string[]

function stubBrowser(options: { api?: boolean; registered?: boolean; permission?: PermissionState | 'throws' } = {}) {
  const { api = true, registered = true, permission = 'granted' } = options
  tags = []
  register = vi.fn(async (tag: string) => void (tags = [...new Set([...tags, tag])]))
  unregister = vi.fn(async (tag: string) => void (tags = tags.filter((t) => t !== tag)))
  getTags = vi.fn(async () => [...tags])
  const registration = { scope: 'http://localhost:4000/', ...(api ? { periodicSync: { register, unregister, getTags } } : {}) }
  vi.stubGlobal('ServiceWorkerRegistration', class {})
  if (api) (globalThis.ServiceWorkerRegistration.prototype as unknown as Record<string, unknown>).periodicSync = {}
  vi.stubGlobal('location', { href: 'http://localhost:4000/settings' })
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistrations: async () => (registered ? [registration] : []) },
    permissions: {
      query: async () => {
        if (permission === 'throws') throw new TypeError('Failed to execute query: The provided value is not a valid enum value')
        return { state: permission }
      },
    },
  })
}

beforeEach(() => {
  setPwa({ periodicTags: [] })
  stubBrowser()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('periodicSync.isSupported', () => {
  it('is true where the registration prototype has periodicSync, false where it does not or there is no registration class', () => {
    expect(periodicSync.isSupported()).toBe(true)
    stubBrowser({ api: false })
    expect(periodicSync.isSupported()).toBe(false)
    vi.stubGlobal('ServiceWorkerRegistration', undefined)
    expect(periodicSync.isSupported()).toBe(false)
  })
})

describe('periodicSync.register', () => {
  it('registers the tag with the asked interval as minInterval, and puts what the browser reports in the store', async () => {
    await periodicSync.register('digest-refresh', 3_600_000)
    expect(register).toHaveBeenCalledExactlyOnceWith('digest-refresh', { minInterval: 3_600_000 })
    expect(usePwaStore.getState().periodicTags).toEqual(['digest-refresh'])
  })

  it.each([['denied'], ['prompt']] as const)('refuses with NotAllowedError, and registers nothing, when the permission is %s (a tab that is not an installed app)', async (permission) => {
    stubBrowser({ permission })
    await expect(periodicSync.register('digest-refresh', 60_000)).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(register).not.toHaveBeenCalled()
    expect(usePwaStore.getState().periodicTags).toEqual([])
  })

  it('lets the browser decide when it cannot even answer the permission query', async () => {
    stubBrowser({ permission: 'throws' })
    await periodicSync.register('digest-refresh', 60_000)
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('lets the browser refusal from register() through (Chrome says NotAllowedError: Permission denied in a tab)', async () => {
    register.mockRejectedValueOnce(new DOMException('Permission denied.', 'NotAllowedError'))
    await expect(periodicSync.register('digest-refresh', 60_000)).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(usePwaStore.getState().periodicTags).toEqual([])
  })

  it('throws NotSupportedError where there is no API', async () => {
    stubBrowser({ api: false })
    await expect(periodicSync.register('digest-refresh', 60_000)).rejects.toMatchObject({ name: 'NotSupportedError' })
  })

  it('says so when no worker is registered', async () => {
    stubBrowser({ registered: false })
    await expect(periodicSync.register('digest-refresh', 60_000)).rejects.toMatchObject({ name: 'InvalidStateError' })
  })
})

describe('periodicSync.unregister and list', () => {
  it('unregisters the tag and updates the store', async () => {
    await periodicSync.register('digest-refresh', 60_000)
    await periodicSync.unregister('digest-refresh')
    expect(unregister).toHaveBeenCalledExactlyOnceWith('digest-refresh')
    expect(usePwaStore.getState().periodicTags).toEqual([])
  })

  it('has nothing to remove, and is not an error, where there is no API', async () => {
    stubBrowser({ api: false })
    setPwa({ periodicTags: ['stale'] })
    await expect(periodicSync.unregister('digest-refresh')).resolves.toBeUndefined()
    expect(usePwaStore.getState().periodicTags).toEqual([])
  })

  it('lists what the browser says, and corrects a store that believed something else', async () => {
    tags = ['digest-refresh']
    setPwa({ periodicTags: [] })
    await expect(periodicSync.list()).resolves.toEqual(['digest-refresh'])
    expect(usePwaStore.getState().periodicTags).toEqual(['digest-refresh'])
    tags = []
    await periodicSync.list()
    expect(usePwaStore.getState().periodicTags).toEqual([])
  })

  it('lists nothing where there is no API, or no worker', async () => {
    stubBrowser({ api: false })
    await expect(periodicSync.list()).resolves.toEqual([])
    stubBrowser({ registered: false })
    await expect(periodicSync.list()).resolves.toEqual([])
  })

  it('lets a getTags failure through and leaves the store as it was', async () => {
    getTags.mockRejectedValueOnce(new DOMException('Not allowed', 'NotAllowedError'))
    setPwa({ periodicTags: ['digest-refresh'] })
    await expect(periodicSync.list()).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(usePwaStore.getState().periodicTags).toEqual(['digest-refresh'])
  })
})
