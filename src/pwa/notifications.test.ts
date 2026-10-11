import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setPwa, usePwaStore } from './store'

const getPushVapid = vi.fn()
const subscribePush = vi.fn()
const unsubscribePush = vi.fn()
vi.mock('@/lib/queries/endpoints', () => ({
  getPushVapid: (...args: unknown[]) => getPushVapid(...args),
  subscribePush: (...args: unknown[]) => subscribePush(...args),
  unsubscribePush: (...args: unknown[]) => unsubscribePush(...args),
}))

const { notifications } = await import('./notifications')

/** A 65-byte uncompressed P-256 point (04 then 64 bytes), as base64url, like the server's key. */
const KEY_BYTES = Uint8Array.from([4, ...Array.from({ length: 64 }, (_, i) => i + 1)])
const PUBLIC_KEY = btoa(String.fromCharCode(...KEY_BYTES)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const SUBSCRIPTION_JSON = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', expirationTime: null, keys: { p256dh: 'p', auth: 'a' } }

function fakeSubscription() {
  return { endpoint: SUBSCRIPTION_JSON.endpoint, toJSON: () => SUBSCRIPTION_JSON, unsubscribe: vi.fn(async () => true) }
}

interface FakePush {
  existing: ReturnType<typeof fakeSubscription> | null
  subscribe: ReturnType<typeof vi.fn>
}

function stubBrowser(options: { registered?: boolean; active?: boolean; existing?: boolean } = {}) {
  const { registered = true, active = true, existing = false } = options
  const push: FakePush = {
    existing: existing ? fakeSubscription() : null,
    subscribe: vi.fn(async () => push.existing ?? fakeSubscription()),
  }
  const showNotification = vi.fn(async () => undefined)
  const registration = {
    scope: 'http://localhost:4000/',
    active: active ? { state: 'activated' } : null,
    pushManager: { getSubscription: vi.fn(async () => push.existing), subscribe: push.subscribe },
    showNotification,
  }
  vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => (registered ? [registration] : []) } })
  vi.stubGlobal('location', { href: 'http://localhost:4000/settings' })
  vi.stubGlobal('PushManager', class {})
  return { push, registration, showNotification }
}

beforeEach(() => {
  getPushVapid.mockReset().mockResolvedValue({ data: { publicKey: PUBLIC_KEY } })
  subscribePush.mockReset().mockResolvedValue({ data: { id: 'ps-1' } })
  unsubscribePush.mockReset().mockResolvedValue({ data: { removed: true } })
  setPwa({ pushSubscribed: false, notificationPermission: 'default' })
  stubBrowser()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('notifications.permission and requestPermission', () => {
  it('reports unsupported where there is no Notification API', () => {
    vi.stubGlobal('Notification', undefined)
    expect(notifications.permission()).toBe('unsupported')
  })

  it('reads the browser permission', () => {
    vi.stubGlobal('Notification', { permission: 'granted' })
    expect(notifications.permission()).toBe('granted')
  })

  it('asks the browser, returns the answer, and writes it to the store', async () => {
    const request = vi.fn(async () => 'granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: request })
    await expect(notifications.requestPermission()).resolves.toBe('granted')
    expect(request).toHaveBeenCalledTimes(1)
    expect(usePwaStore.getState().notificationPermission).toBe('granted')
  })

  it('records a refusal as it is', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: async () => 'denied' })
    await expect(notifications.requestPermission()).resolves.toBe('denied')
    expect(usePwaStore.getState().notificationPermission).toBe('denied')
  })

  it('throws NotSupportedError where there is no Notification API', async () => {
    vi.stubGlobal('Notification', undefined)
    await expect(notifications.requestPermission()).rejects.toMatchObject({ name: 'NotSupportedError' })
  })
})

describe('notifications.subscribePush', () => {
  beforeEach(() => vi.stubGlobal('Notification', { permission: 'granted' }))

  it('subscribes with userVisibleOnly and the key as 65 bytes, registers the subscription with the server, and marks the store', async () => {
    const { push } = stubBrowser()
    const json = await notifications.subscribePush()
    const options = push.subscribe.mock.calls[0]?.[0] as { userVisibleOnly: boolean; applicationServerKey: Uint8Array }
    expect(options.userVisibleOnly).toBe(true)
    expect(options.applicationServerKey).toBeInstanceOf(Uint8Array)
    expect(Array.from(options.applicationServerKey)).toEqual(Array.from(KEY_BYTES))
    expect(subscribePush).toHaveBeenCalledExactlyOnceWith({ subscription: SUBSCRIPTION_JSON })
    expect(json).toEqual(SUBSCRIPTION_JSON)
    expect(usePwaStore.getState().pushSubscribed).toBe(true)
  })

  it('rejects with the browser error and tells the server nothing when permission is refused', async () => {
    const { push } = stubBrowser()
    push.subscribe.mockRejectedValueOnce(new DOMException('Registration failed - permission denied', 'NotAllowedError'))
    await expect(notifications.subscribePush()).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(subscribePush).not.toHaveBeenCalled()
    expect(usePwaStore.getState().pushSubscribed).toBe(false)
  })

  it('undoes the browser subscription it just made when the server will not take it, and rethrows', async () => {
    const { push } = stubBrowser()
    const made = fakeSubscription()
    push.subscribe.mockResolvedValueOnce(made)
    subscribePush.mockRejectedValueOnce(new Error('server down'))
    await expect(notifications.subscribePush()).rejects.toThrow('server down')
    expect(made.unsubscribe).toHaveBeenCalledTimes(1)
    expect(usePwaStore.getState().pushSubscribed).toBe(false)
  })

  it('keeps a subscription that already existed when the server call fails', async () => {
    const { push } = stubBrowser({ existing: true })
    subscribePush.mockRejectedValueOnce(new Error('server down'))
    await expect(notifications.subscribePush()).rejects.toThrow('server down')
    expect(push.existing?.unsubscribe).not.toHaveBeenCalled()
  })

  it('stops with the server error when the VAPID key cannot be fetched, without subscribing', async () => {
    const { push } = stubBrowser()
    getPushVapid.mockRejectedValueOnce(new Error('offline'))
    await expect(notifications.subscribePush()).rejects.toThrow('offline')
    expect(push.subscribe).not.toHaveBeenCalled()
  })

  it('says so when no worker is registered, or none is active yet', async () => {
    stubBrowser({ registered: false })
    await expect(notifications.subscribePush()).rejects.toMatchObject({ name: 'InvalidStateError' })
    stubBrowser({ active: false })
    await expect(notifications.subscribePush()).rejects.toMatchObject({ name: 'InvalidStateError' })
  })

  it('says so where there is no push support', async () => {
    vi.stubGlobal('PushManager', undefined)
    await expect(notifications.subscribePush()).rejects.toMatchObject({ name: 'NotSupportedError' })
  })
})

describe('notifications.unsubscribePush and getSubscription', () => {
  it('unsubscribes in the browser, tells the server the endpoint, and clears the store', async () => {
    const { push } = stubBrowser({ existing: true })
    setPwa({ pushSubscribed: true })
    await notifications.unsubscribePush()
    expect(push.existing?.unsubscribe).toHaveBeenCalledTimes(1)
    expect(unsubscribePush).toHaveBeenCalledExactlyOnceWith({ endpoint: SUBSCRIPTION_JSON.endpoint })
    expect(usePwaStore.getState().pushSubscribed).toBe(false)
  })

  it('does nothing to the server when the browser has no subscription, and still clears the store', async () => {
    stubBrowser()
    setPwa({ pushSubscribed: true })
    await notifications.unsubscribePush()
    expect(unsubscribePush).not.toHaveBeenCalled()
    expect(usePwaStore.getState().pushSubscribed).toBe(false)
  })

  it('has already left the browser when the server call fails, and says the store is unsubscribed', async () => {
    const { push } = stubBrowser({ existing: true })
    unsubscribePush.mockRejectedValueOnce(new Error('server down'))
    await expect(notifications.unsubscribePush()).rejects.toThrow('server down')
    expect(push.existing?.unsubscribe).toHaveBeenCalledTimes(1)
    expect(usePwaStore.getState().pushSubscribed).toBe(false)
  })

  it('reads the subscription from the browser and keeps the store in step', async () => {
    stubBrowser({ existing: true })
    await expect(notifications.getSubscription()).resolves.toEqual(SUBSCRIPTION_JSON)
    expect(usePwaStore.getState().pushSubscribed).toBe(true)
  })

  it('returns null when the browser has none, or no worker is registered', async () => {
    stubBrowser()
    setPwa({ pushSubscribed: true })
    await expect(notifications.getSubscription()).resolves.toBeNull()
    expect(usePwaStore.getState().pushSubscribed).toBe(false)
    stubBrowser({ registered: false })
    await expect(notifications.getSubscription()).resolves.toBeNull()
  })
})

describe('notifications.showLocal', () => {
  it('shows through the registration, with the title and options it was given', async () => {
    const { showNotification } = stubBrowser()
    await notifications.showLocal('Outpost local test', { body: 'Shown by this page' })
    expect(showNotification).toHaveBeenCalledExactlyOnceWith('Outpost local test', { body: 'Shown by this page' })
  })

  it('says so when no worker is registered', async () => {
    stubBrowser({ registered: false })
    await expect(notifications.showLocal('x')).rejects.toMatchObject({ name: 'InvalidStateError' })
  })

  it('lets the browser refusal through (permission not granted)', async () => {
    const { showNotification } = stubBrowser()
    showNotification.mockRejectedValueOnce(new TypeError('No notification permission has been granted for this origin.'))
    await expect(notifications.showLocal('x')).rejects.toThrow(/permission/)
  })
})
