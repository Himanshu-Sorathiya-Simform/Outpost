import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toAppError } from '@/lib/errors/normalize'
import { registration, syncFromBrowser } from './registration'
import { setPwa, usePwaStore } from './store'
import { describeSlots } from './sw-state'

describe('describeSlots', () => {
  const slot = (state: string) => ({ state })
  const none = { installing: null, waiting: null, active: null }

  it.each([
    ['nothing in any slot', none, 'none'],
    ['a worker installing', { ...none, installing: slot('installing') }, 'installing'],
    ['a worker installed and waiting', { ...none, waiting: slot('installed') }, 'waiting'],
    ['an activated worker', { ...none, active: slot('activated') }, 'active'],
    ['a worker still activating', { ...none, active: slot('activating') }, 'activating'],
    ['an update installing behind an active worker', { installing: slot('installing'), waiting: null, active: slot('activated') }, 'installing'],
    ['an update waiting behind an active worker', { installing: null, waiting: slot('installed'), active: slot('activated') }, 'waiting'],
  ])('%s', (_name, slots, expected) => {
    expect(describeSlots(slots)).toBe(expected)
  })
})

class FakeWorker extends EventTarget {
  state: ServiceWorkerState
  stateListeners = 0
  constructor(state: ServiceWorkerState) {
    super()
    this.state = state
  }
  override addEventListener(...args: Parameters<EventTarget['addEventListener']>): void {
    if (args[0] === 'statechange') this.stateListeners += 1
    super.addEventListener(...args)
  }
  moveTo(state: ServiceWorkerState): void {
    this.state = state
    this.dispatchEvent(new Event('statechange'))
  }
}

class FakeRegistration extends EventTarget {
  scope = 'http://localhost:4000/'
  installing: FakeWorker | null = null
  waiting: FakeWorker | null = null
  active: FakeWorker | null = null
  updates = 0
  unregistered = false
  update = (): Promise<void> => {
    this.updates += 1
    return Promise.resolve()
  }
  unregister = (): Promise<boolean> => {
    this.unregistered = true
    return Promise.resolve(true)
  }
}

const asReg = (r: FakeRegistration): ServiceWorkerRegistration => r as unknown as ServiceWorkerRegistration

/** A stand-in for navigator.serviceWorker that remembers what register() was asked for and lists what exists. */
function installFakeContainer(existing: FakeRegistration[] = []) {
  const regs = [...existing]
  const container = {
    register: vi.fn(async (_url: string) => {
      const reg = regs[0] ?? new FakeRegistration()
      if (!regs.includes(reg)) regs.push(reg)
      return asReg(reg)
    }),
    getRegistrations: vi.fn(async () => regs.map(asReg)),
  }
  vi.stubGlobal('navigator', { serviceWorker: container })
  vi.stubGlobal('location', { href: 'http://localhost:4000/log' })
  return { container, regs }
}

beforeEach(() => {
  setPwa({ swRegistered: false, swState: 'none' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('registration.register', () => {
  it('registers /sw.js and mirrors the installing worker into the store', async () => {
    const { container, regs } = installFakeContainer([])
    const reg = new FakeRegistration()
    reg.installing = new FakeWorker('installing')
    regs.push(reg)

    await registration.register()

    expect(container.register).toHaveBeenCalledWith('/sw.js')
    expect(usePwaStore.getState()).toMatchObject({ swRegistered: true, swState: 'installing' })
  })

  it('follows statechange through to active, moving the worker between slots as the browser does', async () => {
    const { regs } = installFakeContainer([])
    const reg = new FakeRegistration()
    const worker = new FakeWorker('installing')
    reg.installing = worker
    regs.push(reg)
    await registration.register()

    reg.installing = null
    reg.waiting = worker
    worker.moveTo('installed')
    expect(usePwaStore.getState().swState).toBe('waiting')

    reg.waiting = null
    reg.active = worker
    worker.moveTo('activating')
    expect(usePwaStore.getState().swState).toBe('activating')
    worker.moveTo('activated')
    expect(usePwaStore.getState().swState).toBe('active')
  })

  it('picks up a worker that arrives later through updatefound', async () => {
    const { regs } = installFakeContainer([])
    const reg = new FakeRegistration()
    reg.active = new FakeWorker('activated')
    regs.push(reg)
    await registration.register()
    expect(usePwaStore.getState().swState).toBe('active')

    const incoming = new FakeWorker('installing')
    reg.installing = incoming
    reg.dispatchEvent(new Event('updatefound'))
    expect(usePwaStore.getState().swState).toBe('installing')

    reg.installing = null
    reg.waiting = incoming
    incoming.moveTo('installed')
    expect(usePwaStore.getState().swState).toBe('waiting')
  })

  it('attaches nothing twice when register() runs again (boot, then the Lab button)', async () => {
    const { regs } = installFakeContainer([])
    const reg = new FakeRegistration()
    const worker = new FakeWorker('activated')
    reg.active = worker
    regs.push(reg)

    await registration.register()
    await registration.register()
    await registration.register()

    expect(worker.stateListeners).toBe(1)
  })

  it('reports what the browser has, not "registered", when register() rejects', async () => {
    const { container } = installFakeContainer([])
    setPwa({ swRegistered: true, swState: 'active' })
    container.register.mockRejectedValueOnce(new TypeError('A bad HTTP response code (404) was received when fetching the script.'))

    await expect(registration.register()).rejects.toThrow('404')

    expect(usePwaStore.getState()).toMatchObject({ swRegistered: false, swState: 'none' })
  })

  it('does nothing, and does not throw, where there is no service worker API', async () => {
    vi.stubGlobal('navigator', {})
    await expect(registration.register()).resolves.toBeUndefined()
    expect(usePwaStore.getState()).toMatchObject({ swRegistered: false, swState: 'none' })
  })

  it('drops a registration that disappeared when its first install failed', async () => {
    const { regs } = installFakeContainer([])
    const reg = new FakeRegistration()
    const worker = new FakeWorker('installing')
    reg.installing = worker
    regs.push(reg)
    await registration.register()

    reg.installing = null
    regs.length = 0
    worker.moveTo('redundant')
    await vi.waitFor(() => expect(usePwaStore.getState()).toMatchObject({ swRegistered: false, swState: 'none' }))
  })
})

describe('registration.unregister', () => {
  it('finds the registration without a variable from register(), removes it and resets the store', async () => {
    const reg = new FakeRegistration()
    reg.active = new FakeWorker('activated')
    installFakeContainer([reg])
    setPwa({ swRegistered: true, swState: 'active' })

    await expect(registration.unregister()).resolves.toBe(true)

    expect(reg.unregistered).toBe(true)
    expect(usePwaStore.getState()).toMatchObject({ swRegistered: false, swState: 'none' })
  })

  it('resolves false when there was nothing to remove, and still corrects the store', async () => {
    installFakeContainer([])
    setPwa({ swRegistered: true, swState: 'active' })
    await expect(registration.unregister()).resolves.toBe(false)
    expect(usePwaStore.getState().swRegistered).toBe(false)
  })
})

describe('registration.checkForUpdate', () => {
  it('asks the browser to re-fetch the worker script', async () => {
    const reg = new FakeRegistration()
    reg.active = new FakeWorker('activated')
    installFakeContainer([reg])
    await registration.checkForUpdate()
    expect(reg.updates).toBe(1)
  })

  it('turns the TypeError of an unreachable script into a NetworkError, so the page files it as "network" and not "unknown"', async () => {
    const reg = new FakeRegistration()
    reg.active = new FakeWorker('activated')
    reg.update = () => Promise.reject(new TypeError("Failed to update a ServiceWorker for scope ('http://localhost:4000/'): An unknown error occurred when fetching the script."))
    installFakeContainer([reg])

    let error: unknown
    try {
      await registration.checkForUpdate()
    } catch (thrown) {
      error = thrown
    }

    expect(error).toBeInstanceOf(DOMException)
    expect(error).toMatchObject({ name: 'NetworkError' })
    expect((error as DOMException).message).toContain('fetching the script')
    expect(toAppError(error, { source: 'test' }).kind).toBe('network')
  })

  it('lets any other update failure through unchanged', async () => {
    const reg = new FakeRegistration()
    reg.active = new FakeWorker('activated')
    reg.update = () => Promise.reject(new DOMException('The script resource is behind a redirect.', 'SecurityError'))
    installFakeContainer([reg])
    await expect(registration.checkForUpdate()).rejects.toMatchObject({ name: 'SecurityError' })
  })

  it('says so when nothing is registered, instead of reporting a check that did not happen', async () => {
    installFakeContainer([])
    await expect(registration.checkForUpdate()).rejects.toMatchObject({ name: 'InvalidStateError' })
  })

  it('reports NotSupportedError where the API is missing', async () => {
    vi.stubGlobal('navigator', {})
    await expect(registration.checkForUpdate()).rejects.toMatchObject({ name: 'NotSupportedError' })
  })
})

describe('syncFromBrowser', () => {
  it('corrects a store that still claims a registration the browser no longer has', async () => {
    installFakeContainer([])
    setPwa({ swRegistered: true, swState: 'active' })
    await syncFromBrowser()
    expect(usePwaStore.getState()).toMatchObject({ swRegistered: false, swState: 'none' })
  })

  it('adopts a registration the store has never heard of', async () => {
    const reg = new FakeRegistration()
    reg.active = new FakeWorker('activated')
    installFakeContainer([reg])
    await syncFromBrowser()
    expect(usePwaStore.getState()).toMatchObject({ swRegistered: true, swState: 'active' })
  })

  it('leaves the store alone when the browser cannot be read', async () => {
    const { container } = installFakeContainer([])
    container.getRegistrations.mockRejectedValueOnce(new DOMException('detached', 'InvalidStateError'))
    setPwa({ swRegistered: true, swState: 'active' })
    await syncFromBrowser()
    expect(usePwaStore.getState().swState).toBe('active')
  })
})
