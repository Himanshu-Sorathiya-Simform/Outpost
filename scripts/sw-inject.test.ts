import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUILD_ID_TOKEN, injectServiceWorker, PRECACHE_TOKEN, requireShellUrls, shellUrls } from './sw-inject'

const template = `const BUILD_ID = ${BUILD_ID_TOKEN}\nconst PRECACHE_URLS = ${PRECACHE_TOKEN}\nuse(BUILD_ID)\n`

describe('injectServiceWorker', () => {
  it('replaces the list and the build id, and nothing else', () => {
    const out = injectServiceWorker(template, { buildId: 'mfx3k9', urls: ['/assets/a-1.js', '/assets/b-2.css'] })
    expect(out).toBe(`const BUILD_ID = "mfx3k9"\nconst PRECACHE_URLS = ["/assets/a-1.js","/assets/b-2.css"]\nuse(BUILD_ID)\n`)
  })

  it('writes an empty list as []', () => {
    expect(injectServiceWorker(template, { buildId: 'x', urls: [] })).toContain('const PRECACHE_URLS = []')
  })

  it('produces different bytes for a different build id or a different list, which is what makes a deploy a new worker', () => {
    const a = injectServiceWorker(template, { buildId: 'one', urls: ['/assets/a.js'] })
    expect(injectServiceWorker(template, { buildId: 'two', urls: ['/assets/a.js'] })).not.toBe(a)
    expect(injectServiceWorker(template, { buildId: 'one', urls: ['/assets/b.js'] })).not.toBe(a)
    expect(injectServiceWorker(template, { buildId: 'one', urls: ['/assets/a.js'] })).toBe(a)
  })

  it('refuses a template that lost a token, instead of shipping a worker that precaches nothing', () => {
    expect(() => injectServiceWorker('const BUILD_ID = "x"', { buildId: 'x', urls: [] })).toThrow(/missing the build token/)
    expect(() => injectServiceWorker(`const BUILD_ID = ${BUILD_ID_TOKEN}`, { buildId: 'x', urls: [] })).toThrow(/PRECACHE_URLS/)
  })

  it('escapes what it writes, so an odd build id cannot break out of the string', () => {
    const out = injectServiceWorker(template, { buildId: `a"b\\c`, urls: [] })
    expect(out).toContain(String.raw`const BUILD_ID = "a\"b\\c"`)
  })
})

describe('shellUrls', () => {
  const html = `<!doctype html><html><head>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <script type="module" crossorigin src="/assets/index-AAA.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/ui-BBB.js">
    <link rel="stylesheet" crossorigin href="/assets/ui-CCC.css">
    <link rel="stylesheet" crossorigin href="/assets/index-DDD.css">
  </head><body><div id="root"></div></body></html>`

  const sheets: Record<string, string> = {
    '/assets/ui-CCC.css': `@font-face{font-family:A;src:url(/assets/a-latin-111.woff2) format("woff2")}@font-face{font-family:A;src:url(/assets/a-ext-222.woff2) format("woff2")}`,
    '/assets/index-DDD.css': `@font-face{font-family:B;src:url( "/assets/b-latin-333.woff2" ) format("woff2")} body{background:url(/media/x.svg)}`,
  }
  const read = (url: string): string | undefined => sheets[url]

  it('is what index.html points at, plus what its stylesheets point at, sorted', () => {
    expect(shellUrls(html, read)).toEqual([
      '/assets/a-ext-222.woff2',
      '/assets/a-latin-111.woff2',
      '/assets/b-latin-333.woff2',
      '/assets/index-AAA.js',
      '/assets/index-DDD.css',
      '/assets/ui-BBB.js',
      '/assets/ui-CCC.css',
    ])
  })

  it('leaves out the unhashed files, anything outside /assets/, and every lazy route chunk', () => {
    const urls = shellUrls(html, read)
    expect(urls).not.toContain('/favicon.svg')
    expect(urls).not.toContain('/media/x.svg')
    expect(urls.some((u) => u.includes('LogPage') || u.includes('ErrorsPage'))).toBe(false)
  })

  it('copes with a stylesheet it cannot read, and with a page that names no assets', () => {
    expect(shellUrls(html, () => undefined)).toEqual(['/assets/index-AAA.js', '/assets/index-DDD.css', '/assets/ui-BBB.js', '/assets/ui-CCC.css'])
    expect(shellUrls('<html></html>', read)).toEqual([])
  })

  it('lists a file once even when two stylesheets point at it', () => {
    const twice = (url: string): string | undefined => (url.endsWith('.css') ? 'a{src:url(/assets/same-1.woff2)}' : undefined)
    expect(shellUrls(html, twice).filter((u) => u === '/assets/same-1.woff2')).toHaveLength(1)
  })
})

describe('requireShellUrls', () => {
  it('passes a list through unchanged', () => {
    expect(requireShellUrls(['/assets/a.js', '/assets/b.css'])).toEqual(['/assets/a.js', '/assets/b.css'])
  })

  it('refuses an empty list, so a changed index.html fails the build instead of shipping a worker that precaches nothing', () => {
    expect(() => requireShellUrls([])).toThrow(/no \/assets\/ files/)
  })

  it('is what stops the realistic failure: an index.html written in a way the extraction does not recognise', () => {
    const rewritten = `<script type=module src=/assets/index-AAA.js></script><link rel=stylesheet href=/assets/ui-BBB.css>`
    expect(() => requireShellUrls(shellUrls(rewritten, () => undefined))).toThrow(/no \/assets\/ files/)
  })
})

describe('public/sw.js template', () => {
  const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

  it('still carries both build tokens exactly once, so the build step has something to replace', () => {
    expect(source.split(PRECACHE_TOKEN)).toHaveLength(2)
    expect(source.split(BUILD_ID_TOKEN)).toHaveLength(2)
  })

  it('builds into a worker with no token left over', () => {
    const out = injectServiceWorker(source, { buildId: 'test', urls: ['/assets/x.js'] })
    expect(out).not.toContain('__PRECACHE_URLS__')
    expect(out).not.toContain('__BUILD_ID__')
  })
})
