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
