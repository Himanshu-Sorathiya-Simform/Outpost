import { beforeEach, describe, expect, it } from 'vitest'
import { ORIGIN, PRECACHE_CACHE, setup, SLUGS, JSON_TYPE, SERVED_AT, HEALTHY } from './sw-harness'

describe('cache-only routes', () => {
  let sw: ReturnType<typeof setup>
  beforeEach(async () => {
    sw = setup(HEALTHY)
    await sw.install()
    sw.requested.length = 0
  })

  const answer = async (path: string): Promise<Response> => {
    const r = await sw.dispatch({ url: `${ORIGIN}${path}` })
    if (r === 'not handled') throw new Error(`${path} was not handled`)
    return r
  }

  it.each(['/api/handbook', ...SLUGS.map((s) => `/api/handbook/${s}`), '/api/bench/cache-only/alpha', '/api/bench/cache-only/beta', '/api/bench/cache-only/gamma'])(
    'answers %s from the cache, labelled as a stored copy, without touching the network',
    async (path) => {
      const r = await answer(path)
      expect(r.status).toBe(200)
      expect(r.headers.get('x-sw-source')).toBe('cache')
      expect(r.headers.get('x-sw-strategy')).toBe('cache-only')
      expect(r.headers.get('x-sw-cache')).toBe(PRECACHE_CACHE)
      expect(r.headers.get('x-served-at')).toBe(SERVED_AT)
      expect(r.headers.get('x-sw-cached-at')).not.toBeNull()
      expect(r.headers.get('content-type')).toBe(JSON_TYPE)
      expect(await r.json()).toBeTypeOf('object')
      expect(sw.requested).toHaveLength(0)
    },
  )

  it('answers the same URL twice with a full body each time', async () => {
    const a = await (await answer('/api/handbook')).text()
    const b = await (await answer('/api/handbook')).text()
    expect(a.length).toBeGreaterThan(20)
    expect(b).toBe(a)
  })

  it('answers with the stored copy when the network is down', async () => {
    sw.setOffline(true)
    expect((await answer('/api/handbook/power-and-fuel')).status).toBe(200)
    expect(sw.requested).toHaveLength(0)
  })

  it('answers with what it stored, not what the server holds now', async () => {
    const stored = await (await answer('/api/bench/cache-only/alpha')).json()
    expect(stored).toMatchObject({ rev: 1 })
  })

  it('answers delta with a cache-miss even though the server is up and holds it: the route never goes to the network', async () => {
    const r = await answer('/api/bench/cache-only/delta')
    expect(r.status).toBe(504)
    expect(r.headers.get('x-sw-source')).toBe('cache-miss')
    expect(sw.requested).toHaveLength(0)
  })

  it('makes the miss in the server error shape the page decodes, with no header that says the server answered', async () => {
    const r = await answer('/api/bench/cache-only/delta')
    const body = (await r.json()) as { error: { code: string; message: string; requestId: string } }
    expect(body.error.code).toBe('unavailable')
    expect(body.error.message).toContain('/api/bench/cache-only/delta')
    expect(body.error.requestId).toMatch(/^sw-/)
    expect(r.headers.get('content-type')).toContain('application/json')
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(r.headers.get('x-served-by')).toBeNull()
    expect(r.headers.get('x-sw-strategy')).toBe('cache-only')
  })

  it.each([
    ['a chapter that was never stored', '/api/handbook/not-a-chapter'],
    ['the index with a query string, which is a different URL', '/api/handbook?x=1'],
    ['a chapter with a query string', `/api/handbook/${SLUGS[0]}?x=1`],
    ['the index with a trailing slash', '/api/handbook/'],
    ['a bench key nobody precached', '/api/bench/cache-only/omega'],
  ])('answers %s with a cache-miss, never with a near match', async (_name, path) => {
    const r = await answer(path)
    expect(r.status).toBe(504)
    expect(r.headers.get('x-sw-source')).toBe('cache-miss')
    expect(sw.requested).toHaveLength(0)
  })

  it('treats a cache that cannot be read as a miss, so the page shows the same screen', async () => {
    sw.setCacheUnreadable(true)
    const r = await answer('/api/handbook')
    expect(r.status).toBe(504)
    expect(r.headers.get('x-sw-source')).toBe('cache-miss')
  })

  it('does not handle names that only start with the same letters', async () => {
    for (const path of ['/api/handbook-archive', '/api/handbooks', '/api/handbookx/alpha', '/api/bench/stale-while-revalidate-x/alpha']) {
      expect(await sw.dispatch({ url: `${ORIGIN}${path}` })).toBe('not handled')
    }
  })

  it('does not handle writes or other methods on these routes, so a bump still reaches the server', async () => {
    expect(await sw.dispatch({ method: 'POST', url: `${ORIGIN}/api/bench/cache-only/alpha/bump` })).toBe('not handled')
    expect(await sw.dispatch({ method: 'HEAD', url: `${ORIGIN}/api/handbook` })).toBe('not handled')
  })

  it('does not handle a navigation to a cache-only URL typed into the address bar', async () => {
    expect(await sw.dispatch({ url: `${ORIGIN}/api/handbook`, mode: 'navigate' })).toBe('not handled')
  })

  it('still leaves every other API route to the network', async () => {
    for (const path of ['/api/signal', '/api/inbox/read-all', '/api/session', '/api/ping', '/api/version', '/api/_lab/state', '/api/_lab/events']) {
      expect(await sw.dispatch({ url: `${ORIGIN}${path}` })).toBe('not handled')
    }
  })
})
