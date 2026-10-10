// What it holds:  what the worker does when the browser installs it (install) and when it takes over (activate).
// What it means: a service worker has a life cycle. The browser downloads the script, runs `install` once (the place to precache), then
//                `activate` once it may take over. This worker installs by precaching the shell and the handbook, skips the waiting
//                state, and on activation claims the pages that are already open.
// Caching type:  precache (install runs the precache type).
// Caches touched: shell-v1 and precache-v1, through caching/precache.ts.

import { precache } from './caching/precache'
import { scope } from './lib/scope'

/** Precache, and only when that worked, skip the waiting state. A rejection here is what makes the browser discard this worker. */
export async function install(): Promise<void> {
  await precache()
  // skipWaiting() lets this worker replace an older one at once. Fine for now; exercise 10 takes it out and makes it a choice.
  await scope.skipWaiting()
}

/** Without claim() the page that registered this worker stays uncontrolled until it reloads. */
export async function activate(): Promise<void> {
  await scope.clients.claim()
}
