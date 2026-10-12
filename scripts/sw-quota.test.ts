import { beforeEach, describe, expect, it } from 'vitest'
import { API_CACHE, HEALTHY, ORIGIN, json, setup, type Served } from './sw-harness'

/**
 * A full disk (QuotaExceededError) while the worker stores an answer: caching/runtime.ts store(). The page already has its answer, so the only
 * question is what the cache does about it: delete the bucket's 10 oldest entries and try once more, never the entry being replaced.
 */
describe('a full disk while storing', () => {
  const INBOX = '/api/inbox/summary'
  let files: Record<string, Served>
  let sw: ReturnType<typeof setup>

  const summary = (n: number): string => `${INBOX}?n=${n}`
  const ask = async (path: string): Promise<Response> => {
    const r = await sw.dispatch({ url: `${ORIGIN}${path}` })
    if (r === 'not handled') throw new Error(`${path} was not handled`)
    return r
  }
  const stored = (): string[] => [...(sw.stores.get(API_CACHE)?.keys() ?? [])].map((k) => k.replace(`${ORIGIN}${INBOX}`, ''))
  /** Fills the api bucket with `?n=1` ... `?n=count`, oldest first. */
  const fill = async (count: number): Promise<void> => {
    for (let n = 1; n <= count; n += 1) {
      await (await ask(summary(n))).text()
      await sw.settle()
    }
  }

  beforeEach(async () => {
    files = { ...HEALTHY, [INBOX]: json({ unread: 3 }) }
    sw = setup(files)
    await sw.install()
    sw.warnings.length = 0
  })

  it('deletes the 10 oldest entries, tries once more, and the new answer is stored', async () => {
    await fill(12)
    sw.setWritesFail(1)
    const r = await ask(summary(13))
    expect(await r.json()).toEqual({ unread: 3 })
    await sw.settle()
    expect(stored()).toEqual(['?n=11', '?n=12', '?n=13'])
    expect(sw.warnings).toHaveLength(1)
    expect(String(sw.warnings[0]?.[0])).toContain('was full, dropped its 10 oldest entries')
  })

  it('with a bucket that has fewer entries, drops what there is and still stores', async () => {
    await fill(3)
    sw.setWritesFail(1)
    await (await ask(summary(4))).text()
    await sw.settle()
    expect(stored()).toEqual(['?n=4'])
  })

  it('when the second try fails too: logs it, the page is unharmed, and the copy being replaced is still there', async () => {
    await fill(2)
    files[INBOX] = json({ unread: 9 })
    sw.setWritesFail(true)
    const r = await ask(summary(2))
    expect(await r.json()).toEqual({ unread: 9 })
    await sw.settle()
    expect(stored()).toEqual(['?n=2'])
    expect(sw.warnings).toHaveLength(2)
    expect(String(sw.warnings[1]?.[0])).toContain('could not store')
    const kept = await sw.stores.get(API_CACHE)?.get(`${ORIGIN}${summary(2)}`)?.clone().json()
    expect(kept).toEqual({ unread: 3 })
  })

  it('does nothing special when the write works', async () => {
    await fill(3)
    expect(stored()).toEqual(['?n=1', '?n=2', '?n=3'])
    expect(sw.warnings).toEqual([])
  })
})
