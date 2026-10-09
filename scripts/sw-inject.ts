/**
 * Build-time half of the service worker: public/sw.js is a template, and these two tokens in it are replaced in dist/sw.js
 * after every build. The reason is not convenience. A browser decides "is there a new worker?" by comparing the bytes of
 * sw.js. If the precache list and the build id lived anywhere else, a deploy would change every hashed file and leave sw.js
 * byte for byte the same, so no worker would ever re-install and the precache would be stale for good.
 */

/** The list of files to precache, as written in the template. Replaced by a JSON array of URL paths. */
export const PRECACHE_TOKEN = '/* __PRECACHE_URLS__ */ []'

/** The build id, quoted in the template. Replaced by a JSON string. */
export const BUILD_ID_TOKEN = "'__BUILD_ID__'"

export interface InjectOptions {
  buildId: string
  urls: readonly string[]
}

/** Replaces both tokens. Throws when one is missing: a worker that silently precaches nothing is worse than a failed build. */
export function injectServiceWorker(source: string, { buildId, urls }: InjectOptions): string {
  for (const token of [PRECACHE_TOKEN, BUILD_ID_TOKEN]) {
    if (!source.includes(token)) throw new Error(`public/sw.js is missing the build token ${token}. The service worker build step has nothing to replace.`)
  }
  return source.replaceAll(PRECACHE_TOKEN, JSON.stringify(urls)).replaceAll(BUILD_ID_TOKEN, JSON.stringify(buildId))
}

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
