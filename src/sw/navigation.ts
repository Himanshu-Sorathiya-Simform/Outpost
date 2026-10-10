// What it holds:  how the worker answers a page navigation (the browser asking for an HTML page): isAppRoute() and navigate().
// What it means: opening or reloading `/log` is a navigation, not an API call. The server answers every app route with the same
//                index.html, so when the network is down or too slow the worker can answer ANY app route with the stored copy of it, and
//                the router in the page draws the right screen. The page's code is there too: the install stored the shell files and
//                every website route chunk, so the screen can paint with no network. The strategy is network first with a deadline, so a
//                deploy is seen at once and a dead or hanging server does not hold the page.
// Caching type:  precache (it only READS shell-v1, which the install wrote; it never writes).
// Caches touched: shell-v1 (read: '/index.html').
//
// What navigate() does, step by step:
//   1. Ask for the page, preferring the browser's navigation preload (a request the browser already started, in parallel with this worker
//      waking up). The preload is used only when the server said the page must be revalidated; a page marked as cacheable for a long time
//      (the "HTTP cache trap" profile) might come from the HTTP cache, so then the page is fetched again with cache 'no-cache'.
//   2. Give it NETWORK_TIMEOUT_MS. A page that arrives in time (any status below 500) is answered as it is.
//   3. A network error, a 5xx or a timeout: answer the stored '/index.html'. The URL stays what the user typed, and each screen shows its own
//      state. (The other option, a redirect to /offline, would change the URL; the bytes are the same.)
//   4. No stored page: there is nothing to fall back to, so a failure is rethrown as without a worker, a 5xx is handed over as it is, and a
//      slow page is waited for.
// An API or media URL is never answered with the page: isAppRoute() keeps them out, and the page would read an HTML body as a parse error.

import { NETWORK_TIMEOUT_MS, SHELL_CACHE } from './config'

/** A path the server would answer with the app shell: no file extension, and not an API or media URL. */
export function isAppRoute(pathname: string): boolean {
  return !/\.[a-z0-9]+$/i.test(pathname) && !pathname.startsWith('/api/') && !pathname.startsWith('/media/')
}

/** What one try at the page came to. `unusable` is a real response with a 5xx status. */
type Page = { kind: 'page'; response: Response } | { kind: 'unusable'; response: Response } | { kind: 'failed'; error: unknown }

/** A response that says it may be reused for a while: it could have come out of the browser's HTTP cache, which may hold an old page. */
const mayBeReused = (response: Response): boolean => /max-age=[1-9]/.test(response.headers.get('cache-control') || '')

/**
 * The page as the server has it now. The preload is always awaited, so the browser does not cancel it and fetch the page a second time; it
 * is used unless it may have come from the HTTP cache (then the page is fetched again, bypassing that cache).
 */
async function fetchPage(event: FetchEvent): Promise<Response> {
  const preloaded = await event.preloadResponse
  if (preloaded && !mayBeReused(preloaded)) return preloaded
  return fetch(new Request(event.request, { cache: 'no-cache' }))
}

async function tryPage(event: FetchEvent): Promise<Page> {
  try {
    const response = await fetchPage(event)
    return response.status >= 500 ? { kind: 'unusable', response } : { kind: 'page', response }
  } catch (error) {
    return { kind: 'failed', error }
  }
}

/** The stored page, or undefined. A bucket that cannot be read counts as one that has nothing. */
async function storedShell(): Promise<Response | undefined> {
  try {
    return await caches.match('/index.html', { cacheName: SHELL_CACHE })
  } catch {
    return undefined
  }
}

/** Network first with a deadline, the stored page when the network fails or is too slow: see the step list at the top of this file. */
export async function navigate(event: FetchEvent): Promise<Response> {
  const attempt = tryPage(event)
  // Keeps the worker alive until the page request is over, so a preload that is still running is not cancelled.
  event.waitUntil(attempt)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<undefined>((resolve) => {
    timer = setTimeout(resolve, NETWORK_TIMEOUT_MS)
  })
  const early = await Promise.race([attempt, timedOut])
  clearTimeout(timer)
  if (early?.kind === 'page') return early.response

  const shell = await storedShell()
  if (shell) return shell

  const outcome = early ?? (await attempt)
  if (outcome.kind === 'failed') throw outcome.error
  return outcome.response
}
