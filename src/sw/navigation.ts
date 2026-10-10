// What it holds:  how the worker answers a page navigation (the browser asking for an HTML page): isAppRoute() and navigate().
// What it means: opening or reloading `/log` is a navigation, not an API call. The server answers every app route with the same
//                index.html, so when the network is down the worker can answer any app route with the stored copy of it and the router
//                in the page draws the right screen. The strategy is network first, so a deploy is seen at once.
// Caching type:  precache (it only READS shell-v1, which the install wrote; it never writes).
// Caches touched: shell-v1 (read: '/index.html').
//
// Not done yet (exercise 8): a timeout on the network try, a redirect to /offline, navigation preload.

import { SHELL_CACHE } from './config'

/** A path the server would answer with the app shell: no file extension, and not an API or media URL. */
export function isAppRoute(pathname: string): boolean {
  return !/\.[a-z0-9]+$/i.test(pathname) && !pathname.startsWith('/api/') && !pathname.startsWith('/media/')
}

/** Network first, so a deploy is seen at once. Only when the network fails does the page get the stored shell. */
export async function navigate(request: Request): Promise<Response> {
  try {
    return await fetch(request)
  } catch (error) {
    const shell = await caches.match('/index.html', { cacheName: SHELL_CACHE })
    if (shell) return shell
    throw error
  }
}
