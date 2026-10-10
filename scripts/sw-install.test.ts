import { describe, expect, it, vi } from 'vitest'
import { ORIGIN, SHELL_CACHE, PRECACHE_CACHE, URLS, Served, setup, SLUGS, JSON_TYPE, SERVED_AT, json, chapterBody, apiFixtures, HEALTHY } from './sw-harness'

describe('install', () => {
  it('stores the shell under three keys and every precached file under its own URL, in shell-v1', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    const store = sw.stores.get(SHELL_CACHE)
    expect([...(store?.keys() ?? [])].sort()).toEqual(
      [`${ORIGIN}/`, `${ORIGIN}/index.html`, `${ORIGIN}/offline`, ...URLS.map((u) => `${ORIGIN}${u}`)].sort(),
    )
    expect(await sw.stores.get(SHELL_CACHE)?.get(`${ORIGIN}/offline`)?.text()).toBe('<html>shell</html>')
  })

  it('fetches with the HTTP cache bypassed, and asks for HTML when it fetches the shell', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    expect(sw.requested.every((r) => r.cache === 'reload')).toBe(true)
    expect(sw.requested.find((r) => r.url === '/index.html')?.accept).toBe('text/html')
    expect(sw.requested).toHaveLength(1 + URLS.length + 1 + SLUGS.length + 3)
  })

  it('finishes when the browser allows only a few connections and an unread body keeps its connection busy (the "No store" profile)', async () => {
    // Under No store nothing drains a response body that nobody reads, so a download that only looked at the headers would hold its
    // connection. The install starts every download at once; with the connections taken the rest would wait for ever.
    const sw = setup(HEALTHY, URLS, { connectionLimit: 2 })
    const finished = (async (): Promise<string> => {
      await sw.install()
      return 'finished'
    })()
    const outcome = await Promise.race([finished, new Promise<string>((resolve) => setTimeout(() => resolve('hung'), 2000))])
    expect(outcome).toBe('finished')
    expect(sw.stores.get(SHELL_CACHE)?.size).toBe(3 + URLS.length)
    expect(await sw.stores.get(SHELL_CACHE)?.get(`${ORIGIN}${URLS[0]}`)?.text()).toBe('console.log(1)')
  })

  it('calls skipWaiting only after the precache succeeded', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    expect(sw.skipWaiting).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a file the server answers 404', { ...HEALTHY, '/assets/index-AAA.js': { status: 404, type: 'text/plain', body: 'no' } }, /404/],
    ['a script answered with an HTML page (a captive portal)', { ...HEALTHY, '/assets/index-AAA.js': { type: 'text/html', body: '<html>sign in</html>' } }, /content type/],
    ['a shell answered with something that is not HTML', { ...HEALTHY, '/index.html': { type: 'application/json', body: '{}' } }, /content type/],
    ['a server error', { ...HEALTHY, '/assets/font-CCC.woff2': { status: 503, type: 'application/json', body: '{}' } }, /503/],
  ])('fails the whole install on %s, opens no bucket and does not skip waiting', async (_name, served, reason) => {
    const sw = setup(served)
    await expect(sw.install()).rejects.toThrow(reason)
    expect(sw.stores.size).toBe(0)
    expect(sw.skipWaiting).not.toHaveBeenCalled()
  })

  it('fails when the network is down', async () => {
    const sw = setup(HEALTHY)
    sw.setOffline(true)
    await expect(sw.install()).rejects.toThrow('Failed to fetch')
    expect(sw.skipWaiting).not.toHaveBeenCalled()
  })

  it('still installs where the build step has not run and the list is empty: the shell only', async () => {
    const sw = setup(HEALTHY, [])
    await sw.install()
    expect(sw.stores.get(SHELL_CACHE)?.size).toBe(3)
  })
})

describe('activate', () => {
  it('claims the open pages', async () => {
    const sw = setup(HEALTHY)
    await sw.activate()
    expect(sw.claim).toHaveBeenCalledTimes(1)
  })
})

describe('get-version message', () => {
  it('replies to the sender with the build id and the cache names', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    const postMessage = vi.fn()
    let work: Promise<unknown> = Promise.resolve()
    sw.handler('message')({ data: { type: 'get-version' }, source: { postMessage }, waitUntil: (p: Promise<unknown>) => void (work = p) })
    await work
    expect(postMessage).toHaveBeenCalledWith({ type: 'sw-version', version: 'build-test', caches: [SHELL_CACHE, PRECACHE_CACHE] })
  })

  it('ignores every other message', async () => {
    const sw = setup(HEALTHY)
    const postMessage = vi.fn()
    sw.handler('message')({ data: { type: 'ping', nonce: 'x' }, source: { postMessage }, waitUntil: () => undefined })
    sw.handler('message')({ data: null, source: { postMessage }, waitUntil: () => undefined })
    expect(postMessage).not.toHaveBeenCalled()
  })
})

describe('precaching the API data', () => {
  it('stores the handbook index, every chapter and alpha, beta and gamma in precache-v1, and not delta', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    const keys = [...(sw.stores.get(PRECACHE_CACHE)?.keys() ?? [])].sort()
    expect(keys).toEqual(
      [`${ORIGIN}/api/handbook`, ...SLUGS.map((s) => `${ORIGIN}/api/handbook/${s}`), ...['alpha', 'beta', 'gamma'].map((k) => `${ORIGIN}/api/bench/cache-only/${k}`)].sort(),
    )
    expect(keys.some((k) => k.endsWith('/delta'))).toBe(false)
  })

  it('keeps the shell bucket for the shell: no API URL lands in shell-v1', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    expect([...(sw.stores.get(SHELL_CACHE)?.keys() ?? [])].some((k) => k.includes('/api/'))).toBe(false)
  })

  it('asks for JSON and bypasses the HTTP cache for every API file', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    const api = sw.requested.filter((r) => r.url.startsWith('/api/'))
    expect(api).toHaveLength(1 + SLUGS.length + 3)
    expect(api.every((r) => r.cache === 'reload' && r.accept === 'application/json')).toBe(true)
  })

  it('adds X-SW-Cached-At when it stores, and keeps the server X-Served-At, so a stored copy shows its true age', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    const stored = sw.stores.get(PRECACHE_CACHE)?.get(`${ORIGIN}/api/handbook`)
    expect(stored?.headers.get('x-served-at')).toBe(SERVED_AT)
    const cachedAt = stored?.headers.get('x-sw-cached-at') ?? ''
    expect(Number.isNaN(Date.parse(cachedAt))).toBe(false)
    expect(cachedAt).not.toBe(SERVED_AT)
  })

  it('stores bodies that are still readable after the checks parsed them', async () => {
    const sw = setup(HEALTHY)
    await sw.install()
    const stored = await sw.stores.get(PRECACHE_CACHE)?.get(`${ORIGIN}/api/handbook/${SLUGS[1]}`)?.json()
    expect(stored).toMatchObject({ slug: SLUGS[1], edition: '1988.4' })
  })

  const bad = (patch: Record<string, Served>): Record<string, Served> => ({ ...HEALTHY, ...patch })
  it.each([
    ['the handbook index answering 404', bad({ '/api/handbook': { status: 404, type: JSON_TYPE, body: '{}' } }), /\/api\/handbook answered 404/],
    ['the handbook index being a captive portal page', bad({ '/api/handbook': { type: 'text/html', body: '<html>sign in</html>' } }), /content type/],
    ['the handbook index with a body that stops half way', bad({ '/api/handbook': { type: JSON_TYPE, body: '{"edition":' } }), /not valid JSON/],
    ['the handbook index with an empty body', bad({ '/api/handbook': { type: JSON_TYPE, body: '' } }), /not valid JSON/],
    ['a handbook index that is a list, not an object', bad({ '/api/handbook': { type: JSON_TYPE, body: '[1,2]' } }), /lists no chapters/],
    ['an index that lists no chapters', bad({ '/api/handbook': json({ edition: '1988.4', chapters: [] }) }), /lists no chapters/],
    ['an index that lists a slug that is not a plain slug', bad({ '/api/handbook': json({ edition: '1988.4', chapters: [{ slug: '../x?y' }] }) }), /unusable slug/],
    ['a chapter answering 500', bad({ [`/api/handbook/${SLUGS[1]}`]: { status: 500, type: JSON_TYPE, body: '{}' } }), /500/],
    ['a chapter from another edition than the index', bad({ [`/api/handbook/${SLUGS[0]}`]: json(chapterBody(SLUGS[0] ?? '', '1988.5')) }), /edition 1988\.5 but the index is edition 1988\.4/],
    ['a chapter that is a different chapter', bad({ [`/api/handbook/${SLUGS[0]}`]: json(chapterBody('power-and-fuel', '1988.4')) }), /is the chapter "power-and-fuel"/],
    ['a bench key that is the wrong entry', bad({ '/api/bench/cache-only/beta': json({ strategy: 'cache-first', key: 'beta' }) }), /not the cache-only entry for beta/],
    ['a bench key rate limited', bad({ '/api/bench/cache-only/gamma': { status: 429, type: JSON_TYPE, body: '{}' } }), /429/],
  ])('fails the whole install on %s, and writes nothing, not even to the shell', async (_name, served, reason) => {
    const sw = setup(served)
    await expect(sw.install()).rejects.toThrow(reason)
    expect(sw.stores.size).toBe(0)
    expect(sw.skipWaiting).not.toHaveBeenCalled()
  })

  /** The edition the worker answers /api/handbook with. */
  const editionOf = async (sw: ReturnType<typeof setup>): Promise<string | undefined> => {
    const r = await sw.dispatch({ url: `${ORIGIN}/api/handbook` })
    if (r === 'not handled') return undefined
    const body = (await r.json()) as { edition?: string }
    return body.edition
  }

  it('a new install picks up a new handbook edition, which is the only way the stored copy changes', async () => {
    const served = { ...HEALTHY }
    const first = setup(served)
    await first.install()
    expect(await editionOf(first)).toBe('1988.4')

    Object.assign(served, apiFixtures('1988.5'))
    // The worker that is running keeps answering with what it stored, whatever the server says now.
    expect(await editionOf(first)).toBe('1988.4')

    const second = setup(served)
    await second.install()
    expect(await editionOf(second)).toBe('1988.5')
  })
})
