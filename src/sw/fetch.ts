// What it holds:  the worker's `fetch` listener: the decision, for every request the page makes, of whether the worker answers it and how.
// What it means: every request from a controlled page passes through here first. The worker either answers it (event.respondWith) or does
//                nothing, in which case the browser handles the request exactly as if no worker existed. Not calling respondWith is the
//                normal, cheapest way to stay out of the way.
// Caching type:  none (it only chooses; the strategy it picks has the caching type).
// Caches touched: none directly.
//
// The order of the decision:
//   1. Not a GET (a write, a HEAD): leave it. The worker never touches a write.
//   2. Another origin: leave it.
//   3. A navigation (the browser asking for a page): answer app routes with navigation.ts, leave the rest.
//   4. Otherwise look the path up in the route table (routes.ts). No route: leave it. A route that declines this request: leave it.
//      Otherwise the route's strategy answers.

import { isAppRoute, navigate } from './navigation'
import { scope } from './lib/scope'
import { findRoute } from './routes'

export function onFetch(event: FetchEvent): void {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== scope.location.origin) return
  // Not calling respondWith() leaves the request to the browser, exactly as if there were no worker.
  if (request.mode === 'navigate') {
    if (isAppRoute(url.pathname)) event.respondWith(navigate(event))
    return
  }
  const route = findRoute(url.pathname)
  if (!route || route.declines?.(request)) return
  event.respondWith(route.handle(event, request, url))
}
