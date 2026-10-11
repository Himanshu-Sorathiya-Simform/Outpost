// What it holds:  what the worker does when the browser installs it (install) and when it takes over (activate).
// What it means: a service worker has a life cycle. The browser downloads the script, runs `install` once (the place to precache), then
//                `activate` once it may take over. This worker installs by precaching the shell, the website's route chunks and the
//                handbook, skips the waiting state, and on activation turns on navigation preload, deletes the buckets of older versions
//                and claims the pages that are already open.
// Caching type:  precache (install runs the precache type); activate only deletes (caching/cleanup.ts).
// Caches touched: shell and precache (written, at install, through caching/precache.ts); every outdated bucket of ours (deleted, at activate).
//
// A version bump in config.ts therefore plays out in two steps: install fills the NEW names next to the old ones, and activate, once the
// new worker is in charge, deletes the old ones. Between the two, both generations exist (Lab -> Caches -> Buckets marks the old as superseded).

import { removeOutdated } from './caching/cleanup'
import { precache } from './caching/precache'
import { tellPages } from './lib/messages'
import { scope } from './lib/scope'

/** Precache, and only when that worked, skip the waiting state. A rejection here is what makes the browser discard this worker. */
export async function install(): Promise<void> {
  await precache()
  // skipWaiting() lets this worker replace an older one at once. Fine for now; exercise 10 takes it out and makes it a choice.
  await scope.skipWaiting()
}

/**
 * Deletes the buckets of ours that this worker does not use. Failing to list the caches must not stop the activation (the worker would
 * stay unactivated for a cleanup), so it is logged and the old buckets wait for the next activation. Says in the worker log what went.
 */
async function removeOldGenerations(): Promise<void> {
  try {
    const removed = await removeOutdated()
    if (removed.length > 0) await tellPages({ type: 'log', level: 'info', message: `Activated: deleted the outdated caches ${removed.join(', ')}.` })
  } catch (error) {
    console.warn('Outpost worker: could not remove the outdated caches', error)
  }
}

/**
 * Navigation preload lets the browser start the page request while this worker is still waking up (navigation.ts uses the answer). A
 * browser without it, or a failure to enable it, only costs that speed-up, so it must not stop the activation. Without claim() the page
 * that registered this worker stays uncontrolled until it reloads. The cleanup comes before claim(): the pages this worker takes over then
 * see only the current buckets. skipWaiting (install) means a tab of the previous build is still open at this point and loses the buckets
 * deleted here; its next request for a file only the old build knew goes to a server that no longer has it.
 */
export async function activate(): Promise<void> {
  try {
    await scope.registration?.navigationPreload?.enable()
  } catch (error) {
    console.warn('Outpost worker: could not enable navigation preload', error)
  }
  await removeOldGenerations()
  await scope.clients.claim()
}
