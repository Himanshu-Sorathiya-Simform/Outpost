import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { bundleWorker } from './sw-build'

const bundle = (buildId: string, urls: readonly string[] = ['/assets/a-1.js']): Promise<string> => bundleWorker({ buildId, urls })

describe('bundleWorker', () => {
  it('writes the build id and the shell list into the script, and leaves no placeholder behind', async () => {
    const code = await bundle('mfx3k9', ['/assets/a-1.js', '/assets/b-2.css'])
    expect(code).toContain('"mfx3k9"')
    expect(code).toContain('["/assets/a-1.js", "/assets/b-2.css"]')
    expect(code).not.toMatch(/__BUILD_ID__|__PRECACHE_URLS__/)
  })

  it('produces different bytes for a different build id or a different list, which is what makes a deploy a new worker', async () => {
    const a = await bundle('one', ['/assets/a.js'])
    expect(await bundle('two', ['/assets/a.js'])).not.toBe(a)
    expect(await bundle('one', ['/assets/b.js'])).not.toBe(a)
    expect(await bundle('one', ['/assets/a.js'])).toBe(a)
  })

  it('escapes what it writes, so an odd build id cannot break out of the string', async () => {
    const code = await bundle(`a"b\\c`, [])
    expect(code).toContain(String.raw`"a\"b\\c"`)
    expect(() => new vm.Script(code)).not.toThrow()
  })

  it('is one classic script: no import or export, so the browser needs nothing but sw.js', async () => {
    const code = await bundle('x')
    expect(code).not.toMatch(/^\s*(import|export)\s/m)
    expect(code).not.toContain('importScripts')
    expect(() => new vm.Script(code)).not.toThrow()
  })

  it("does not carry the page's validation library: only types are imported from shared/", async () => {
    const code = await bundle('x')
    expect(code).not.toMatch(/zod|safeParse|ZodError/)
    expect(code.length).toBeLessThan(40_000)
  })

  it('registers exactly the four listeners and nothing runs until the browser fires them', async () => {
    const heard: string[] = []
    const sandbox = {
      self: { addEventListener: (type: string) => void heard.push(type), location: { origin: 'http://localhost:4000' } },
      console,
    }
    vm.runInNewContext(await bundle('x'), sandbox)
    expect(heard).toEqual(['install', 'activate', 'fetch', 'message'])
  })

  it('leaves no public/sw.js behind: a file there would be copied over the built worker', () => {
    expect(() => readFileSync(new URL('../public/sw.js', import.meta.url))).toThrow()
  })
})
