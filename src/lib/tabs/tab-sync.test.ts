// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/lib/query/client'
import { LAB_SETTINGS_KEY, useLabSettings } from '@/lib/settings/lab-settings'
import { PRESENCE_TTL_MS, TAB_CHANNEL, applyPresence, broadcastInvalidate, broadcastSessionChanged, getOpenTabs, getTabId, handleTabMessage, pruneTabs, resetOpenTabs, rotateTabId, startTabSync, type TabPresence } from './tab-sync'

const presence = (tabId: string, over: Partial<TabPresence> = {}): TabPresence => ({ tabId, version: '1.0.0', buildId: 'b1', controller: null, visibility: 'visible', at: 0, ...over })
const wire = (from: string, msg: unknown) => ({ from, msg })

beforeEach(() => {
  resetOpenTabs()
  useLabSettings.getState().reset()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('tab identity', () => {
  it('is stable and kept in sessionStorage', () => {
    const id = getTabId()
    expect(id).toMatch(/^tab-[0-9a-f]{8}$/)
    expect(getTabId()).toBe(id)
    expect(sessionStorage.getItem('outpost.tabId')).toBe(id)
  })
})

describe('tab identity in unusual pages', () => {
  it('still produces an id where crypto.randomUUID does not exist (plain http on a LAN address)', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    expect(() => rotateTabId()).not.toThrow()
    expect(getTabId()).toMatch(/^tab-[0-9a-f]{8}$/)
  })

  it('takes a new id when another document announces the same one, as a duplicated tab does', () => {
    const before = getTabId()
    applyPresence(presence(before), true)
    handleTabMessage(wire(before, { type: 'presence', tab: presence(before) }))
    const after = getTabId()
    expect(after).not.toBe(before)
    expect(sessionStorage.getItem('outpost.tabId')).toBe(after)
    const own = getOpenTabs().filter((t) => t.self)
    expect(own.map((t) => t.tabId)).toEqual([after])
  })
})

describe('presence', () => {
  it('lists this tab first, then others by most recent heartbeat', () => {
    applyPresence(presence('a'), false, 1000)
    applyPresence(presence('me'), true, 500)
    applyPresence(presence('b'), false, 2000)
    expect(getOpenTabs().map((t) => t.tabId)).toEqual(['me', 'b', 'a'])
  })

  it('reports whether a heartbeat came from a new tab, and refreshes known ones in place', () => {
    expect(applyPresence(presence('a'), false, 1000)).toBe(true)
    expect(applyPresence(presence('a', { visibility: 'hidden' }), false, 2000)).toBe(false)
    expect(getOpenTabs()).toHaveLength(1)
    expect(getOpenTabs()[0]).toMatchObject({ visibility: 'hidden', seenAt: 2000 })
  })

  it('expires other tabs after 12 s without a heartbeat, but never this one', () => {
    applyPresence(presence('me'), true, 0)
    applyPresence(presence('gone'), false, 0)
    applyPresence(presence('alive'), false, 8000)
    expect(pruneTabs(PRESENCE_TTL_MS)).toBe(0)
    expect(pruneTabs(PRESENCE_TTL_MS + 1)).toBe(1)
    expect(getOpenTabs().map((t) => t.tabId)).toEqual(['me', 'alive'])
    expect(pruneTabs(60_000)).toBe(1)
    expect(getOpenTabs().map((t) => t.tabId)).toEqual(['me'])
  })

  it('expiry uses the receiver clock, so a wildly wrong sender clock does not matter', () => {
    applyPresence(presence('skewed', { at: 1 }), false, 10_000)
    expect(pruneTabs(10_500)).toBe(0)
  })
})

describe('handleTabMessage', () => {
  it('ignores malformed input and its own messages', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    handleTabMessage('nonsense')
    handleTabMessage({ from: 'x', msg: { type: 'explode' } })
    handleTabMessage(wire(getTabId(), { type: 'invalidate', key: ['a'] }))
    expect(spy).not.toHaveBeenCalled()
  })

  it('invalidates the given key when tab sync is on, and not when it is off', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    handleTabMessage(wire('other', { type: 'invalidate', key: ['dispatches', 'list'] }))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['dispatches', 'list'] })
    useLabSettings.getState().set({ tabSync: false })
    handleTabMessage(wire('other', { type: 'invalidate', key: ['inbox'] }))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('refetches the session when another tab signs in or out', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    handleTabMessage(wire('other', { type: 'session-changed' }))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['session'] })
  })

  it('re-reads lab settings on settings-changed', () => {
    localStorage.setItem(LAB_SETTINGS_KEY, JSON.stringify({ retries: 7 }))
    handleTabMessage(wire('other', { type: 'settings-changed', scope: 'lab' }))
    expect(useLabSettings.getState().retries).toBe(7)
  })

  it('records presence from other tabs', () => {
    handleTabMessage(wire('other', { type: 'presence', tab: presence('other') }))
    expect(getOpenTabs().map((t) => t.tabId)).toContain('other')
  })
})

describe('over a real BroadcastChannel', () => {
  let peer: BroadcastChannel
  let received: unknown[]
  let stop: () => void

  beforeEach(() => {
    received = []
    peer = new BroadcastChannel(TAB_CHANNEL)
    peer.onmessage = (e: MessageEvent<unknown>) => received.push(e.data)
    stop = startTabSync()
  })
  afterEach(() => {
    stop()
    peer.close()
  })

  const ofType = (type: string) => received.filter((r) => (r as { msg: { type: string } }).msg.type === type)

  it('announces itself on start', async () => {
    await vi.waitFor(() => expect(ofType('presence')).toHaveLength(1))
    expect(ofType('presence')[0]).toMatchObject({ from: getTabId(), msg: { tab: { tabId: getTabId(), version: expect.any(String) } } })
    expect(getOpenTabs()[0]).toMatchObject({ self: true, tabId: getTabId() })
  })

  it('learns about a new tab and answers it straight away', async () => {
    await vi.waitFor(() => expect(ofType('presence')).toHaveLength(1))
    peer.postMessage(wire('peer-tab', { type: 'presence', tab: presence('peer-tab') }))
    await vi.waitFor(() => expect(getOpenTabs().map((t) => t.tabId)).toContain('peer-tab'))
    await vi.waitFor(() => expect(ofType('presence')).toHaveLength(2))
  })

  it('fans out invalidations only while the lab setting allows it', async () => {
    broadcastInvalidate(['stations'])
    await vi.waitFor(() => expect(ofType('invalidate')).toHaveLength(1))
    expect(ofType('invalidate')[0]).toMatchObject({ msg: { key: ['stations'] } })
    useLabSettings.getState().set({ tabSync: false })
    await vi.waitFor(() => expect(ofType('settings-changed')).toHaveLength(1))
    broadcastInvalidate(['stations'])
    await new Promise((r) => setTimeout(r, 30))
    expect(ofType('invalidate')).toHaveLength(1)
  })

  it('relays local settings changes but does not echo ones it just received', async () => {
    useLabSettings.getState().set({ retries: 4 })
    await vi.waitFor(() => expect(ofType('settings-changed')).toHaveLength(1))
    expect(ofType('settings-changed')[0]).toMatchObject({ msg: { scope: 'lab' } })

    localStorage.setItem(LAB_SETTINGS_KEY, JSON.stringify({ retries: 9 }))
    peer.postMessage(wire('peer-tab', { type: 'settings-changed', scope: 'lab' }))
    await vi.waitFor(() => expect(useLabSettings.getState().retries).toBe(9))
    await new Promise((r) => setTimeout(r, 30))
    expect(ofType('settings-changed')).toHaveLength(1)
  })

  it('removes this tab from the list when stopped', () => {
    stop()
    expect(getOpenTabs()).toHaveLength(0)
  })
})

describe('when the channel cannot carry a message', () => {
  it('never throws into the caller: a failed broadcast must not fail the write that asked for it', () => {
    class Broken {
      onmessage: unknown = null
      postMessage(): void {
        throw new DOMException('could not be cloned', 'DataCloneError')
      }
      close(): void {}
    }
    vi.stubGlobal('BroadcastChannel', Broken)
    let stop = (): void => undefined
    expect(() => {
      stop = startTabSync()
    }).not.toThrow()
    expect(() => broadcastInvalidate(['stations'])).not.toThrow()
    expect(() => broadcastSessionChanged()).not.toThrow()
    stop()
  })

  it('starts without a channel where BroadcastChannel refuses to open (sandboxed frames)', () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new DOMException('opaque origin', 'SecurityError')
        }
      },
    )
    let stop = (): void => undefined
    expect(() => {
      stop = startTabSync()
    }).not.toThrow()
    expect(getOpenTabs()[0]).toMatchObject({ self: true })
    expect(() => stop()).not.toThrow()
  })
})
