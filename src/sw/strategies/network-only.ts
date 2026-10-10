// What it holds:  the NETWORK-ONLY strategy: networkOnly().
// What it means: straight to the server, never stored, never answered from anywhere else. It is for live data where an old answer is worse
//                than no answer. Most live routes (/api/signal, session, ping, version, push, the lab, every write) are not routed through
//                the worker at all: the worker simply does not call respondWith and the browser handles them as if no worker existed.
//                Only the bench route goes through here, so its answer can be stamped and the page can show "SW network".
// Caching type:  none (it neither reads nor writes any cache).
// Caches touched: none.
//
// What it does:
//   1. Make a copy of the request with cache 'no-store', so the browser's own HTTP cache cannot answer a live read. (Under the "HTTP cache
//      trap" profile the API has max-age=60 and would.) Everything else is kept: headers such as X-Tab-Id (so the server log still names
//      the tab), credentials, the abort signal.
//   2. Ask the server and answer what it says, stamped X-SW-Source: network and X-SW-Strategy: network-only, with no cache named.
//   3. A failure is not caught: the page gets the same network error it would get without a worker, which is what a live route must do.
// Routes: see routes.ts. The never-stored list is NEVER_CACHED in config.ts.

import { stamped } from '../lib/headers'

export async function networkOnly(request: Request): Promise<Response> {
  const response = await fetch(new Request(request, { cache: 'no-store' }))
  return stamped(response, 'network', 'network-only')
}
