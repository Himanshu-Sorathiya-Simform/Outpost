import { describe, expect, it } from 'vitest'
import { isWebsiteSource, requireRouteChunks, requireShellUrls, routeChunkUrls, shellUrls, type ManifestEntry } from './sw-shell'

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

describe('routeChunkUrls', () => {
  const manifest: Record<string, ManifestEntry> = {
    'index.html': { file: 'assets/index-AAA.js', isEntry: true, css: ['assets/index-AAA.css'] } as ManifestEntry,
    'src/features/stations/pages/StationsPage.tsx': {
      file: 'assets/StationsPage-S1.js',
      src: 'src/features/stations/pages/StationsPage.tsx',
      isDynamicEntry: true,
      imports: ['index.html', '_ui-U1.js', '_stations-T1.js'],
      css: ['assets/StationsPage-S1.css'],
    },
    'src/features/log/pages/LogPage.tsx': { file: 'assets/LogPage-L1.js', src: 'src/features/log/pages/LogPage.tsx', isDynamicEntry: true, imports: ['_ui-U1.js'], dynamicImports: ['src/features/log/Filters.tsx'] },
    'src/features/log/Filters.tsx': { file: 'assets/Filters-F1.js', src: 'src/features/log/Filters.tsx', isDynamicEntry: true, css: ['assets/Filters-F1.css'] },
    'src/lab/pages/ChaosPage.tsx': { file: 'assets/ChaosPage-C1.js', src: 'src/lab/pages/ChaosPage.tsx', isDynamicEntry: true, imports: ['_ui-U1.js', '_lab-only-X1.js'] },
    '_ui-U1.js': { file: 'assets/ui-U1.js' },
    '_stations-T1.js': { file: 'assets/stations-T1.js', css: ['assets/stations-T1.css'] },
    '_lab-only-X1.js': { file: 'assets/lab-only-X1.js' },
  }

  // The entry's own files appear because a route imports it; the plugin removes what the shell list already has.
  it('is every website route chunk with what it imports and its stylesheets, sorted', () => {
    expect(routeChunkUrls(manifest, isWebsiteSource)).toEqual([
      '/assets/Filters-F1.css',
      '/assets/Filters-F1.js',
      '/assets/LogPage-L1.js',
      '/assets/StationsPage-S1.css',
      '/assets/StationsPage-S1.js',
      '/assets/index-AAA.css',
      '/assets/index-AAA.js',
      '/assets/stations-T1.css',
      '/assets/stations-T1.js',
      '/assets/ui-U1.js',
    ])
  })

  it('follows a route into the chunks it loads lazily in turn', () => {
    expect(routeChunkUrls(manifest, isWebsiteSource)).toContain('/assets/Filters-F1.js')
  })

  it('leaves the Lab out: its route chunk and the chunks only it imports', () => {
    const urls = routeChunkUrls(manifest, isWebsiteSource)
    expect(urls.some((url) => url.includes('ChaosPage') || url.includes('lab-only'))).toBe(false)
  })

  it('does not follow a website route into a Lab chunk it loads lazily', () => {
    const withLabImport: Record<string, ManifestEntry> = { ...manifest, 'src/features/log/pages/LogPage.tsx': { ...(manifest['src/features/log/pages/LogPage.tsx'] as ManifestEntry), dynamicImports: ['src/lab/pages/ChaosPage.tsx'] } }
    expect(routeChunkUrls(withLabImport, isWebsiteSource).some((url) => url.includes('ChaosPage'))).toBe(false)
  })

  it('lists a file once even when several routes import it, and terminates on an import cycle', () => {
    const cyclic: Record<string, ManifestEntry> = { ...manifest, '_ui-U1.js': { file: 'assets/ui-U1.js', imports: ['_stations-T1.js'] }, '_stations-T1.js': { file: 'assets/stations-T1.js', imports: ['_ui-U1.js'] } }
    const urls = routeChunkUrls(cyclic, isWebsiteSource)
    expect(urls.filter((url) => url === '/assets/ui-U1.js')).toHaveLength(1)
  })

  it('returns nothing for a manifest with no website routes, and requireRouteChunks refuses that', () => {
    expect(routeChunkUrls({}, isWebsiteSource)).toEqual([])
    expect(() => requireRouteChunks([])).toThrow(/no route chunks/)
    expect(requireRouteChunks(['/assets/a.js'])).toEqual(['/assets/a.js'])
  })

  it('tells the website from the Lab by source path', () => {
    expect(isWebsiteSource('src/features/stations/pages/StationsPage.tsx')).toBe(true)
    expect(isWebsiteSource('src/shell/pages/NotFoundPage.tsx')).toBe(true)
    expect(isWebsiteSource('src/lab/pages/ChaosPage.tsx')).toBe(false)
  })
})
