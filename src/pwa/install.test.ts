import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The install module attaches its listeners when it loads, so each test loads a fresh copy against a fresh `window`. */
async function load() {
  vi.resetModules()
  const target = new EventTarget()
  vi.stubGlobal('window', target)
  const { install } = await import('./install')
  const { setPwa, usePwaStore } = await import('./store')
  setPwa({ installPromptAvailable: false })
  return { install, target, store: usePwaStore }
}

/** What Chrome fires: an Event with prompt() and userChoice. `choice` is what the person will answer. */
function promptEvent(choice: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: ReturnType<typeof vi.fn>; userChoice: Promise<{ outcome: string }> }
  event.prompt = vi.fn(async () => undefined)
  event.userChoice = Promise.resolve({ outcome: choice })
  return event
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('beforeinstallprompt', () => {
  it('is listened for when the module loads, kept, held back from the browser, and the store says a prompt is available', async () => {
    const { target, store } = await load()
    const event = promptEvent()
    target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(store.getState().installPromptAvailable).toBe(true)
  })

  it('is caught even when it fires before anything else has run (the listener is attached at load, not in boot)', async () => {
    const { target, install } = await load()
    target.dispatchEvent(promptEvent('accepted'))
    await expect(install.prompt()).resolves.toBe('accepted')
  })
})

describe('install.prompt', () => {
  it('is unavailable when the browser has offered nothing (Safari, Firefox, not installable yet)', async () => {
    const { install } = await load()
    await expect(install.prompt()).resolves.toBe('unavailable')
  })

  it('shows the dialog and returns accepted', async () => {
    const { install, target } = await load()
    const event = promptEvent('accepted')
    target.dispatchEvent(event)
    await expect(install.prompt()).resolves.toBe('accepted')
    expect(event.prompt).toHaveBeenCalledTimes(1)
  })

  it('returns dismissed when the person closes the dialog', async () => {
    const { install, target } = await load()
    target.dispatchEvent(promptEvent('dismissed'))
    await expect(install.prompt()).resolves.toBe('dismissed')
  })

  it('uses the event once: afterwards it is unavailable and the store says so, until the browser offers another', async () => {
    const { install, target, store } = await load()
    const first = promptEvent('dismissed')
    target.dispatchEvent(first)
    await install.prompt()
    expect(store.getState().installPromptAvailable).toBe(false)
    await expect(install.prompt()).resolves.toBe('unavailable')
    expect(first.prompt).toHaveBeenCalledTimes(1)
    const second = promptEvent('accepted')
    target.dispatchEvent(second)
    expect(store.getState().installPromptAvailable).toBe(true)
    await expect(install.prompt()).resolves.toBe('accepted')
  })

  it('does not call prompt() a second time on the same event while the dialog is open', async () => {
    const { install, target } = await load()
    const event = promptEvent('accepted')
    let answer!: (value: { outcome: string }) => void
    event.userChoice = new Promise((resolve) => (answer = resolve))
    target.dispatchEvent(event)
    const first = install.prompt()
    await vi.waitFor(() => expect(event.prompt).toHaveBeenCalledTimes(1))
    await expect(install.prompt()).resolves.toBe('unavailable')
    answer({ outcome: 'accepted' })
    await expect(first).resolves.toBe('accepted')
    expect(event.prompt).toHaveBeenCalledTimes(1)
  })

  it('throws what the browser throws (no user gesture) and keeps the prompt for the next click', async () => {
    const { install, target, store } = await load()
    const event = promptEvent('accepted')
    event.prompt.mockRejectedValueOnce(new DOMException('Needs a user gesture', 'NotAllowedError'))
    target.dispatchEvent(event)
    await expect(install.prompt()).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(store.getState().installPromptAvailable).toBe(true)
    await expect(install.prompt()).resolves.toBe('accepted')
  })
})

describe('appinstalled', () => {
  it('drops the stashed prompt and clears the flag, however the app was installed', async () => {
    const { install, target, store } = await load()
    target.dispatchEvent(promptEvent())
    target.dispatchEvent(new Event('appinstalled'))
    expect(store.getState().installPromptAvailable).toBe(false)
    await expect(install.prompt()).resolves.toBe('unavailable')
  })
})

describe('persistent storage', () => {
  it('is asked for once an install has happened, and not before', async () => {
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { storage: { persist } })
    const { target } = await load()
    target.dispatchEvent(promptEvent())
    expect(persist).not.toHaveBeenCalled()
    target.dispatchEvent(new Event('appinstalled'))
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a browser that refuses', { storage: { persist: vi.fn(async () => false) } }],
    ['a browser whose persist() throws', { storage: { persist: vi.fn(async () => Promise.reject(new DOMException('no', 'SecurityError'))) } }],
    ['a browser with no storage API', {}],
  ])('changes nothing and throws nothing in %s', async (_name, navigatorStub) => {
    vi.stubGlobal('navigator', navigatorStub)
    const { target, store } = await load()
    target.dispatchEvent(promptEvent())
    target.dispatchEvent(new Event('appinstalled'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(store.getState().installPromptAvailable).toBe(false)
  })
})

describe('without a window', () => {
  it('loads and answers unavailable (a server render, a worker)', async () => {
    vi.resetModules()
    vi.stubGlobal('window', undefined)
    const { install } = await import('./install')
    await expect(install.prompt()).resolves.toBe('unavailable')
  })
})
