import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The calls the helper makes to the registration, and what each one does to the store (as the real ones do through mirror()). */
const checkForUpdate = vi.fn<() => Promise<void>>()
const applyUpdate = vi.fn<() => Promise<void>>()

vi.mock('@/pwa', async () => {
  const { create } = await import('zustand')
  const usePwaStore = create<{ updateAvailable: boolean }>()(() => ({ updateAvailable: false }))
  return { usePwaStore, pwa: { registration: { checkForUpdate: () => checkForUpdate(), applyUpdate: () => applyUpdate() } } }
})
vi.mock('@/lib/bridge/seam', () => ({ callSeam: async (_feature: string, fn: () => unknown) => fn() }))

const reload = vi.fn()

async function load() {
  const { reloadForUpdate, INSTALL_WAIT_MS, TAKEOVER_WAIT_MS } = await import('./update-now')
  const { usePwaStore } = await import('@/pwa')
  return { reloadForUpdate, INSTALL_WAIT_MS, TAKEOVER_WAIT_MS, set: (updateAvailable: boolean) => usePwaStore.setState({ updateAvailable }) }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', { location: { reload } })
  checkForUpdate.mockReset().mockResolvedValue(undefined)
  applyUpdate.mockReset().mockResolvedValue(undefined)
  reload.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the update banner\'s Reload', () => {
  it('with a worker already waiting: tells it to take over, does not look again, and only reloads itself if the takeover reload never came', async () => {
    const { reloadForUpdate, set, TAKEOVER_WAIT_MS } = await load()
    set(true)
    const done = reloadForUpdate()
    await vi.advanceTimersByTimeAsync(TAKEOVER_WAIT_MS - 1)
    expect(applyUpdate).toHaveBeenCalledTimes(1)
    expect(checkForUpdate).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await done
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('with none waiting yet: checks for one, and applies it as soon as it shows up', async () => {
    const { reloadForUpdate, set, TAKEOVER_WAIT_MS } = await load()
    set(false)
    checkForUpdate.mockImplementation(async () => {
      set(true)
    })
    const done = reloadForUpdate()
    await vi.advanceTimersByTimeAsync(TAKEOVER_WAIT_MS)
    await done
    expect(checkForUpdate).toHaveBeenCalledTimes(1)
    expect(applyUpdate).toHaveBeenCalledTimes(1)
  })

  it('waits a moment for a worker that finishes installing after the check returns', async () => {
    const { reloadForUpdate, set, INSTALL_WAIT_MS, TAKEOVER_WAIT_MS } = await load()
    set(false)
    const done = reloadForUpdate()
    await vi.advanceTimersByTimeAsync(INSTALL_WAIT_MS - 100)
    expect(applyUpdate).not.toHaveBeenCalled()
    set(true)
    await vi.advanceTimersByTimeAsync(TAKEOVER_WAIT_MS)
    await done
    expect(applyUpdate).toHaveBeenCalledTimes(1)
  })

  it('with no new worker at all: reloads the page as it is once the wait is over, and never applies anything', async () => {
    const { reloadForUpdate, set, INSTALL_WAIT_MS } = await load()
    set(false)
    const done = reloadForUpdate()
    await vi.advanceTimersByTimeAsync(INSTALL_WAIT_MS)
    await done
    expect(applyUpdate).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('when the check fails (no worker support, offline): still reloads, at once', async () => {
    const { reloadForUpdate, set } = await load()
    set(false)
    checkForUpdate.mockRejectedValue(new DOMException('no worker', 'NotSupportedError'))
    await reloadForUpdate()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(applyUpdate).not.toHaveBeenCalled()
  })

  it('when the takeover message cannot be sent: still reloads, at once', async () => {
    const { reloadForUpdate, set } = await load()
    set(true)
    applyUpdate.mockRejectedValue(new DOMException('none waiting', 'InvalidStateError'))
    await reloadForUpdate()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
