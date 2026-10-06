// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startFoundation } from './index'
import { getOpenTabs } from './tabs'

afterEach(() => vi.unstubAllGlobals())

describe('startFoundation', () => {
  it('starts every observer and the disposer stops them all, repeatably', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    const navigate = vi.fn()
    const stop = startFoundation({ navigate })
    expect(document.documentElement.dataset.theme).toBeDefined()
    expect(getOpenTabs()).toHaveLength(1)
    stop()
    expect(getOpenTabs()).toHaveLength(0)

    const again = startFoundation({ navigate })
    expect(getOpenTabs()).toHaveLength(1)
    again()
    again()
  })
})
