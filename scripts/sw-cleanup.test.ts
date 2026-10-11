import { describe, expect, it } from 'vitest'
import { API_CACHE, ASSETS_CACHE, HEALTHY, MEDIA_CACHE, PRECACHE_CACHE, SHELL_CACHE, setup } from './sw-harness'

const CURRENT = [SHELL_CACHE, PRECACHE_CACHE, MEDIA_CACHE, ASSETS_CACHE, API_CACHE]

/** Puts empty buckets with these names into the fake Cache Storage, as an older worker (or another library) would have left them. */
function seed(sw: ReturnType<typeof setup>, names: string[]): void {
  for (const name of names) sw.stores.set(name, new Map())
}

/** Sends the worker a message from a page and waits for what it handed to waitUntil. */
async function send(sw: ReturnType<typeof setup>, data: unknown): Promise<void> {
  let work: Promise<unknown> = Promise.resolve()
  sw.handler('message')({ data, source: { postMessage: () => undefined }, waitUntil: (p: Promise<unknown>) => void (work = p) })
  await work
}

const logs = (sw: ReturnType<typeof setup>): string[] => sw.posted.map((m) => (m as { message?: string }).message ?? '')

describe('activate: deleting the outdated buckets', () => {
  it('deletes our buckets of an older version and keeps the current ones', async () => {
    const sw = setup(HEALTHY)
    seed(sw, [...CURRENT, 'shell-v0', 'precache-v0', 'api-v0', 'media-v0', 'assets-v0'])
    await sw.activate()
    expect([...sw.stores.keys()].sort()).toEqual([...CURRENT].sort())
  })

  it('also deletes a bucket of a NEWER number than the current one, since only the allow-list counts', async () => {
    // A rollback: the worker of the previous release (v1 names) is back, and the v2 buckets of the release it replaced are not its own now.
    const sw = setup(HEALTHY)
    seed(sw, [...CURRENT, 'shell-v2', 'api-v9'])
    await sw.activate()
    expect([...sw.stores.keys()].sort()).toEqual([...CURRENT].sort())
  })

  it('never touches a bucket that is not exactly "<our family>-v<number>"', async () => {
    const foreign = ['workbox-precache-v2-https://example.com/', 'api-gateway', 'api-v2-gateway', 'shell', 'shell-extension-v3', 'other-cache-v1', 'my-api-v1', 'api-v']
    const sw = setup(HEALTHY)
    seed(sw, [...CURRENT, 'api-v0', ...foreign])
    await sw.activate()
    expect([...sw.stores.keys()].sort()).toEqual([...CURRENT, ...foreign].sort())
  })

  it('deletes nothing and still activates when nothing is outdated, and when there are no buckets at all', async () => {
    const sw = setup(HEALTHY)
    await sw.activate()
    seed(sw, CURRENT)
    await sw.activate()
    expect([...sw.stores.keys()].sort()).toEqual([...CURRENT].sort())
    expect(sw.claim).toHaveBeenCalledTimes(2)
    expect(logs(sw)).toEqual([])
  })

  it('claims the pages after the cleanup, and tells the worker log what it deleted', async () => {
    const sw = setup(HEALTHY)
    seed(sw, [SHELL_CACHE, 'shell-v0', 'api-v0'])
    await sw.activate()
    expect(sw.claim).toHaveBeenCalledTimes(1)
    expect(logs(sw)).toEqual(['Activated: deleted the outdated caches shell-v0, api-v0.'])
  })

  it('keeps going when one old bucket cannot be deleted: the others go, the worker still claims, the failure is logged', async () => {
    const sw = setup(HEALTHY)
    seed(sw, [SHELL_CACHE, 'shell-v0', 'api-v0', 'media-v0'])
    sw.setUndeletable(['api-v0'])
    await sw.activate()
    expect([...sw.stores.keys()].sort()).toEqual(['api-v0', SHELL_CACHE])
    expect(sw.claim).toHaveBeenCalledTimes(1)
    expect(sw.warnings.some((w) => String(w[0]).includes('api-v0'))).toBe(true)
  })

  it('still activates and claims when the buckets cannot even be listed', async () => {
    const sw = setup(HEALTHY)
    seed(sw, ['shell-v0'])
    sw.sandbox.caches.keys = async () => {
      throw new DOMException('no storage', 'SecurityError')
    }
    await sw.activate()
    expect(sw.claim).toHaveBeenCalledTimes(1)
    expect(sw.warnings.some((w) => String(w[0]).includes('could not remove the outdated caches'))).toBe(true)
  })

  it('still turns on navigation preload before it cleans up', async () => {
    const sw = setup(HEALTHY)
    await sw.activate()
    expect(sw.enablePreload).toHaveBeenCalledTimes(1)
  })
})

describe('the version bump as a release: install fills the new names, activate removes the old', () => {
  it('an install after a bump leaves both generations until activate runs', async () => {
    const sw = setup(HEALTHY)
    seed(sw, ['shell-v0', 'precache-v0', ASSETS_CACHE, API_CACHE, MEDIA_CACHE])
    await sw.install()
    expect([...sw.stores.keys()].sort()).toEqual([API_CACHE, ASSETS_CACHE, MEDIA_CACHE, PRECACHE_CACHE, 'precache-v0', SHELL_CACHE, 'shell-v0'].sort())
    await sw.activate()
    expect([...sw.stores.keys()].sort()).toEqual([...CURRENT].sort())
  })

  it('keeps the warm entries of a bucket whose number did not change', async () => {
    const sw = setup(HEALTHY)
    const warm = new Response('{}')
    sw.stores.set(API_CACHE, new Map([['http://localhost:4000/api/stations', warm]]))
    seed(sw, ['shell-v0'])
    await sw.activate()
    expect(sw.stores.get(API_CACHE)?.size).toBe(1)
  })
})

describe('clear-caches', () => {
  it('with no prefix deletes every bucket of ours, current ones included, and leaves the others', async () => {
    const sw = setup(HEALTHY)
    seed(sw, [...CURRENT, 'shell-v0', 'workbox-precache-v2-https://example.com/', 'api-gateway'])
    await send(sw, { type: 'clear-caches' })
    expect([...sw.stores.keys()].sort()).toEqual(['api-gateway', 'workbox-precache-v2-https://example.com/'])
    expect(logs(sw)).toEqual(['clear-caches: deleted shell-v1, precache-v1, media-v1, assets-v1, api-v1, shell-v0.'])
  })

  it('with a prefix deletes only our buckets that start with it, every version of them', async () => {
    const sw = setup(HEALTHY)
    seed(sw, [...CURRENT, 'api-v0'])
    await send(sw, { type: 'clear-caches', prefix: 'api-' })
    expect([...sw.stores.keys()].sort()).toEqual([ASSETS_CACHE, MEDIA_CACHE, PRECACHE_CACHE, SHELL_CACHE].sort())
    expect(logs(sw)).toEqual(['clear-caches: deleted api-v1, api-v0.'])
  })

  it('with a prefix that only matches buckets that are not ours deletes nothing, and says so', async () => {
    const sw = setup(HEALTHY)
    seed(sw, [...CURRENT, 'workbox-precache-v2-https://example.com/', 'api-gateway'])
    await send(sw, { type: 'clear-caches', prefix: 'workbox-' })
    await send(sw, { type: 'clear-caches', prefix: 'api-g' })
    expect(sw.stores.size).toBe(CURRENT.length + 2)
    expect(logs(sw)).toEqual(['clear-caches: nothing to delete among our caches starting with "workbox-".', 'clear-caches: nothing to delete among our caches starting with "api-g".'])
  })

  it('says there was nothing to delete when the caches are already empty', async () => {
    const sw = setup(HEALTHY)
    await send(sw, { type: 'clear-caches' })
    expect(logs(sw)).toEqual(['clear-caches: nothing to delete among every cache of ours.'])
  })

  it('ignores a prefix that is not a string, and a message of another type', async () => {
    const sw = setup(HEALTHY)
    seed(sw, CURRENT)
    await send(sw, { type: 'clear-caches', prefix: 42 })
    await send(sw, { type: 'clear-cache' })
    await send(sw, null)
    expect(sw.stores.size).toBe(CURRENT.length)
    expect(logs(sw)).toEqual([])
  })

  it('logs an error to the pages, and does not throw, when the caches cannot be listed', async () => {
    const sw = setup(HEALTHY)
    sw.sandbox.caches.keys = async () => {
      throw new DOMException('no storage', 'SecurityError')
    }
    await send(sw, { type: 'clear-caches' })
    expect(logs(sw)).toEqual(['clear-caches: the caches could not be cleared.'])
  })
})
