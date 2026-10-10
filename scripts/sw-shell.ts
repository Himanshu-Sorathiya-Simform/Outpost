/**
 * Which files make up the app shell: the half of the service worker build that reads what Vite emitted. The other half, bundling the
 * worker and writing these files and the build id into it, is scripts/sw-build.ts.
 */

/**
 * Which files the worker precaches: the app shell, and nothing more. That is what index.html points at (the entry script, the
 * preloaded chunks, the stylesheets) plus what those stylesheets point at (the fonts), so the frame of the app can paint with no
 * network. The lazy route chunks are left out on purpose: precaching them is exercise 8, and until then an unvisited route fails
 * offline, which is the failure that exercise exists to fix.
 *
 * The unhashed files (index.html itself, version.json, icons, favicon) are not in the list either. A worker that serves an unhashed
 * URL cache-first never updates it; the worker fetches the shell separately, with the HTTP cache bypassed.
 *
 * `readText` returns the text of an emitted file by its URL path, or undefined when there is none. Sorted, so the same build always
 * produces the same worker bytes.
 */
export function shellUrls(html: string, readText: (url: string) => string | undefined): string[] {
  const urls = new Set<string>()
  for (const match of html.matchAll(/\b(?:src|href)="(\/assets\/[^"]+)"/g)) if (match[1]) urls.add(match[1])
  for (const sheet of [...urls].filter((url) => url.endsWith('.css'))) {
    for (const match of (readText(sheet) ?? '').matchAll(/url\(\s*["']?(\/assets\/[^)"'\s]+)/g)) if (match[1]) urls.add(match[1])
  }
  return [...urls].sort()
}

/**
 * A build whose index.html names no /assets/ files would still "succeed", with a worker that precaches nothing but the shell and
 * says nothing about it. That is what a change in how Vite writes index.html (quotes, attribute order, a different base path)
 * would cause. Refusing to build is the only way anyone finds out.
 */
export function requireShellUrls(urls: readonly string[]): string[] {
  if (urls.length === 0) {
    throw new Error('The service worker build step found no /assets/ files in dist/index.html, so the precache would be empty. Has the format of index.html changed?')
  }
  return [...urls]
}

/** One entry of Vite's build manifest (dist/.vite/manifest.json): the chunk for a source file, what it imports, and its stylesheets. */
export interface ManifestEntry {
  file: string
  src?: string
  isDynamicEntry?: boolean
  imports?: string[]
  dynamicImports?: string[]
  css?: string[]
}

/**
 * Which lazy chunks the worker precaches besides the shell: every route of the website, with everything each one needs to run (the chunks
 * it imports, its stylesheets, anything it loads lazily in turn). A route's own chunk is a dynamic entry in the manifest whose source file
 * is `isWebsite`; the Lab's pages are left out on purpose (they stay runtime-cached, so a Lab page nobody opened still fails offline, which
 * keeps the "never visited" failure alive for Stale chunks and the release scenario).
 *
 * The result is URL paths under /assets/, sorted so the same build always produces the same worker bytes. It can contain files that are
 * also in the shell list; the caller removes those.
 */
export function routeChunkUrls(manifest: Record<string, ManifestEntry>, isWebsite: (src: string) => boolean): string[] {
  const urls = new Set<string>()
  const seen = new Set<string>()
  const collect = (key: string): void => {
    const entry = manifest[key]
    if (!entry || seen.has(key)) return
    seen.add(key)
    urls.add(`/${entry.file}`)
    for (const sheet of entry.css ?? []) urls.add(`/${sheet}`)
    for (const next of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
      // A lazy import of a Lab chunk from the website is not followed: the Lab is not precached.
      const target = manifest[next]
      if (target?.src && !isWebsite(target.src) && target.isDynamicEntry) continue
      collect(next)
    }
  }
  for (const [key, entry] of Object.entries(manifest)) if (entry.isDynamicEntry && entry.src && isWebsite(entry.src)) collect(key)
  return [...urls].filter((url) => url.startsWith('/assets/')).sort()
}

/** True for a source file that belongs to the website (not the Lab): its lazy chunks are precached. */
export const isWebsiteSource = (src: string): boolean => src.startsWith('src/') && !src.startsWith('src/lab/')

/**
 * A build whose manifest yields no route chunks would still "succeed", with a worker that precaches the shell only and says nothing about
 * it (a change in how Vite writes the manifest would do that). Refusing to build is the only way anyone finds out.
 */
export function requireRouteChunks(urls: readonly string[]): string[] {
  if (urls.length === 0) {
    throw new Error('The service worker build step found no route chunks in dist/.vite/manifest.json, so the precache would hold the shell only. Has the manifest format changed?')
  }
  return [...urls]
}
