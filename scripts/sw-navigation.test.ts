import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HEALTHY, ORIGIN, setup, text, type Served } from './sw-harness'

describe('navigation', () => {
  let files: Record<string, Served>
  let sw: ReturnType<typeof setup>
  const PAGE = '<html>the deployed page</html>'
  const SHELL = '<html>shell</html>'

  beforeEach(async () => {
    files = { ...HEALTHY, '/stations': { type: 'text/html; charset=utf-8', body: PAGE, headers: { 'cache-control': 'no-cache' } } }
    sw = setup(files)
    await sw.install()
    sw.requested.length = 0
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => vi.useRealTimers())

  const go = (path: string, preload?: () => Promise<Response | undefined>) => sw.dispatch({ url: `${ORIGIN}${path}`, mode: 'navigate', preload })
  /** Whether the promise has settled yet, after letting the fake clock run its queue. */
  const settled = async (p: Promise<unknown>): Promise<boolean> => {
    let done = false
    const watch = (async (): Promise<void> => {
      try {
        await p
      } catch {
        // a rejection is also "settled"
      }
      done = true
    })()
    await vi.advanceTimersByTimeAsync(0)
    void watch
    return done
  }

  describe('the page arrives in time', () => {
    it('is answered as the server sent it, so a deploy shows at once', async () => {
      expect(await text(await go('/stations'))).toBe(PAGE)
    })

    it('is asked for with the browser HTTP cache bypassed, so an old copy cannot answer', async () => {
      await go('/stations')
      expect(sw.requested).toEqual([{ url: '/stations', cache: 'no-cache', accept: null }])
    })

    it('hands over a 404 as it is: only a failure falls back to the stored page', async () => {
      files['/stations'] = { status: 404, type: 'text/plain', body: 'nothing here' }
      const r = await go('/stations')
      expect(r).not.toBe('not handled')
      expect((r as Response).status).toBe(404)
    })

    it('answers an app route that has no file extension, including the root and /offline', async () => {
      for (const path of ['/', '/offline', '/log/dp-000064', '/stations/KRN-07', '/handbook/power-and-fuel', '/lab/chaos']) {
        expect(await go(path), path).not.toBe('not handled')
      }
    })
  })

  describe('the network fails', () => {
    it('answers the stored page for every app route, whatever the URL', async () => {
      sw.setOffline(true)
      for (const path of ['/stations', '/log', '/handbook/power-and-fuel', '/offline', '/', '/lab/chaos']) {
        expect(await text(await go(path)), path).toBe(SHELL)
      }
    })

    it('answers the stored page for a 5xx, which a visitor should not see instead of the app', async () => {
      files['/stations'] = { status: 503, type: 'text/html', body: '<html>bad gateway</html>' }
      expect(await text(await go('/stations'))).toBe(SHELL)
    })

    it('rethrows the failure when there is no stored page, as without a worker', async () => {
      const empty = setup(HEALTHY)
      empty.setOffline(true)
      await expect(empty.dispatch({ url: `${ORIGIN}/stations`, mode: 'navigate' })).rejects.toBeInstanceOf(TypeError)
    })

    it('hands over a 5xx when there is no stored page', async () => {
      const empty = setup({ ...HEALTHY, '/stations': { status: 502, type: 'text/html', body: '<html>bad gateway</html>' } })
      const r = (await empty.dispatch({ url: `${ORIGIN}/stations`, mode: 'navigate' })) as Response
      expect(r.status).toBe(502)
    })

    it('treats a bucket that cannot be read as having no stored page', async () => {
      sw.setOffline(true)
      sw.setCacheUnreadable(true)
      await expect(go('/stations')).rejects.toBeInstanceOf(TypeError)
    })
  })

  describe('the network is too slow', () => {
    it('answers the stored page after 3 seconds, not before', async () => {
      files['/stations'] = { ...(files['/stations'] as Served), delayMs: 8000 }
      const pending = go('/stations')
      await vi.advanceTimersByTimeAsync(2999)
      expect(await settled(pending)).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await text(await pending)).toBe(SHELL)
    })

    it('answers at once when the page comes in time, however slow the rest', async () => {
      files['/stations'] = { ...(files['/stations'] as Served), delayMs: 1500 }
      const pending = go('/stations')
      await vi.advanceTimersByTimeAsync(1500)
      expect(await text(await pending)).toBe(PAGE)
    })

    it('waits for a slow page when nothing is stored, however long it takes', async () => {
      const empty = setup({ ...HEALTHY, '/stations': { type: 'text/html', body: PAGE, delayMs: 9000 } })
      const pending = empty.dispatch({ url: `${ORIGIN}/stations`, mode: 'navigate' })
      await vi.advanceTimersByTimeAsync(9000)
      expect(await text(await pending)).toBe(PAGE)
    })
  })

  describe('navigation preload', () => {
    const early = (headers: Record<string, string>) => async (): Promise<Response | undefined> => new Response('<html>from the preload</html>', { status: 200, headers: { 'content-type': 'text/html', ...headers } })

    it('uses the preloaded page without asking again, when the server said it must be revalidated', async () => {
      expect(await text(await go('/stations', early({ 'cache-control': 'no-cache' })))).toBe('<html>from the preload</html>')
      expect(sw.requested).toHaveLength(0)
    })

    it('uses it when the server said nothing about caching', async () => {
      expect(await text(await go('/stations', early({})))).toBe('<html>from the preload</html>')
      expect(sw.requested).toHaveLength(0)
    })

    it('asks again, bypassing the HTTP cache, when the preloaded page may have come from it (a year of max-age)', async () => {
      expect(await text(await go('/stations', early({ 'cache-control': 'max-age=31536000' })))).toBe(PAGE)
      expect(sw.requested).toEqual([{ url: '/stations', cache: 'no-cache', accept: null }])
    })

    it('goes to the network when there was no preload', async () => {
      await go('/stations', async () => undefined)
      expect(sw.requested).toHaveLength(1)
    })

    it('treats a preload that fails as a failed page and falls back to the stored one', async () => {
      expect(await text(await go('/stations', () => Promise.reject(new TypeError('preload failed'))))).toBe(SHELL)
    })
  })

  describe('what is left alone', () => {
    it.each(['/api/dispatches', '/api/stations', '/api/handbook', '/media/dispatch/dp-000001.svg', '/readme.txt', '/assets/index-AAA.js', '/sw.js', '/version.json'])(
      'does not answer a navigation to %s with the page',
      async (path) => {
        sw.setOffline(true)
        expect(await go(path)).toBe('not handled')
      },
    )

    it('does not handle a write or another origin', async () => {
      expect(await sw.dispatch({ method: 'POST', url: `${ORIGIN}/stations`, mode: 'navigate' })).toBe('not handled')
      expect(await sw.dispatch({ url: 'https://example.com/stations', mode: 'navigate' })).toBe('not handled')
    })
  })
})

describe('activate', () => {
  it('turns on navigation preload, then claims the open pages', async () => {
    const sw = setup(HEALTHY)
    await sw.activate()
    expect(sw.enablePreload).toHaveBeenCalledTimes(1)
    expect(sw.claim).toHaveBeenCalledTimes(1)
  })

  it('still claims the pages when navigation preload cannot be enabled, and says so', async () => {
    const sw = setup(HEALTHY)
    sw.enablePreload.mockRejectedValueOnce(new Error('not supported'))
    await sw.activate()
    expect(sw.claim).toHaveBeenCalledTimes(1)
    expect(String(sw.warnings.at(-1)?.[0])).toContain('navigation preload')
  })
})
