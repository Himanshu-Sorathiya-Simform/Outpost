import { beforeEach, describe, expect, it } from 'vitest'
import { ORIGIN, setup, HEALTHY, text } from './sw-harness'

describe('fetch', () => {
  let sw: ReturnType<typeof setup>
  beforeEach(async () => {
    sw = setup(HEALTHY)
    await sw.install()
    sw.requested.length = 0
  })

  it('answers a precached file from the cache without touching the network', async () => {
    const answer = await sw.dispatch({ url: `${ORIGIN}/assets/index-AAA.js` })
    expect(await text(answer)).toBe('console.log(1)')
    expect(sw.requested).toHaveLength(0)
  })

  it('does not handle API calls, version files, icons or the worker script', async () => {
    for (const path of ['/api/signal', '/api/_lab/state', '/version.json', '/favicon.svg', '/icons/icon-192.png', '/sw.js']) {
      expect(await sw.dispatch({ url: `${ORIGIN}${path}` })).toBe('not handled')
    }
  })

  it('does not handle writes, whatever the URL', async () => {
    expect(await sw.dispatch({ method: 'POST', url: `${ORIGIN}/assets/index-AAA.js` })).toBe('not handled')
    expect(await sw.dispatch({ method: 'PATCH', url: `${ORIGIN}/api/dispatches/dp-000001` })).toBe('not handled')
  })

  it('does not handle another origin', async () => {
    expect(await sw.dispatch({ url: 'https://example.com/assets/index-AAA.js' })).toBe('not handled')
  })

  it('answers a navigation from the network when it is up, so a deploy shows at once', async () => {
    const answer = await sw.dispatch({ url: `${ORIGIN}/log`, mode: 'navigate' })
    expect(sw.requested.map((r) => r.url)).toEqual(['/log'])
    expect(answer).not.toBe('not handled')
  })

  it('answers a navigation with the stored shell when the network fails', async () => {
    sw.setOffline(true)
    for (const path of ['/log', '/stations/KRN-07', '/lab/worker', '/handbook/power-and-fuel', '/offline', '/']) {
      expect(await text(await sw.dispatch({ url: `${ORIGIN}${path}`, mode: 'navigate' }))).toBe('<html>shell</html>')
    }
  })

  it('lets a navigation to an API, media or file URL fail like a plain page would', async () => {
    sw.setOffline(true)
    for (const path of ['/api/dispatches', '/media/dispatch/dp-000001.svg', '/readme.txt']) {
      expect(await sw.dispatch({ url: `${ORIGIN}${path}`, mode: 'navigate' })).toBe('not handled')
    }
  })

  it('fails a navigation when the network is down and there is no stored shell', async () => {
    const empty = setup(HEALTHY)
    empty.setOffline(true)
    await expect(empty.dispatch({ url: `${ORIGIN}/log`, mode: 'navigate' })).rejects.toBeInstanceOf(TypeError)
  })

  it('serves the stored copy of a precached file even when the network is down', async () => {
    sw.setOffline(true)
    expect(await text(await sw.dispatch({ url: `${ORIGIN}/assets/index-BBB.css` }))).toBe('body{}')
  })
})
