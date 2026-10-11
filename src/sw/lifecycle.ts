// What it holds:  what the worker does when the browser installs it (install) and when it takes over (activate).
// What it means: a service worker has a life cycle. The browser downloads the script, runs `install` once (the place to precache), then
//                `activate` once it may take over. This worker installs by precaching the shell, the website's route chunks and the
//                handbook, and then WAITS if an older worker is still in charge: it activates only when a page tells it to (the
//                `skip-waiting` message, lib/messages.ts) or when no tab uses the old one any more. On activation it turns on navigation
//                preload, deletes the buckets of older versions and claims the pages that are already open. The very first install has
//                nobody to wait for and activates at once.
// Caching type:  precache (install runs the precache type); activate only deletes (caching/cleanup.ts).
// Caches touched: shell and precache (written, at install, through caching/precache.ts); every outdated bucket of ours (deleted, at activate).
//
// An update therefore plays out in three steps: install fills the NEW names next to the old ones, the worker WAITS while the old one keeps
// serving the open tabs (Lab -> Worker -> Registrations: waiting beside active; Lab -> Caches -> Buckets marks a bumped old bucket as
// superseded), and activate, once the user applies the update, deletes the old names and takes over. A bucket whose number did not change is
// shared by both workers the whole time: the install of the waiting worker already added its files to it.

import { removeOutdated } from './caching/cleanup'
import { precache } from './caching/precache'
import { tellPages } from './lib/messages'
import { scope } from './lib/scope'

/**
 * Precache, and nothing else. A rejection here is what makes the browser discard this worker. There is no skipWaiting() on purpose: a worker
 * that replaced the old one at install would switch the code under tabs that are open and busy. It waits for the page's `skip-waiting`.
 */
export async function install(): Promise<void> {
  await precache()
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
 * see only the current buckets. The cleanup is why activation is a choice: a tab of the previous build that is still open when this runs
 * loses the buckets deleted here, and its next request for a file only the old build knew goes to a server that no longer has it. The page
 * reloads every tab that was controlled when the controller changes (src/pwa/registration.ts), so no tab is left on the old code.
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
