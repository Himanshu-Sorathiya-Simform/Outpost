import { describe, expect, it } from 'vitest'
import { requireShellUrls, shellUrls } from './sw-shell'

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
