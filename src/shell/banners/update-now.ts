import { callSeam } from '@/lib/bridge/seam'
import { pwa, usePwaStore } from '@/pwa'

/**
 * How long "Reload" waits, AFTER the browser's update check has finished (which itself waits for an install), for a worker to show up as waiting
 * before it gives up and reloads the page as it is. A margin, not the install time.
 */
export const INSTALL_WAIT_MS = 3000

/** How long it waits for the page to reload by itself after a worker has been told to take over, before it reloads the page itself. */
export const TAKEOVER_WAIT_MS = 3000

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** True as soon as a new worker is waiting behind the one that controls this page, false when `ms` runs out first. */
function updateWaiting(ms: number): Promise<boolean> {
  if (usePwaStore.getState().updateAvailable) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      stop()
      resolve(false)
    }, ms)
    const stop = usePwaStore.subscribe((state) => {
      if (!state.updateAvailable) return
      clearTimeout(timer)
      stop()
      resolve(true)
    })
  })
}

/**
 * The banner's "Reload": gets this tab onto the newest build, and not just onto newer page code.
 *
 * A plain reload keeps the OLD worker in charge (it only lets go when it is told to), and that worker serves the old shell. So the banner's
 * Reload would load the new files under the old worker and raise the "Update ready" toast, one step short of done. This does the whole thing:
 *   1. No worker waiting yet (the banner appears first, from /version.json): ask the browser to look for a new one and wait a few seconds for
 *      it to finish installing.
 *   2. A worker is waiting: tell it to take over. The page reloads by itself when the controller changes (watchController, registration.ts),
 *      so nothing else is done here, apart from a fallback reload if that does not happen.
 *   3. None appears, or any step fails (no worker support, offline): reload the page as it is, which is what the button did before.
 */
export async function reloadForUpdate(): Promise<void> {
  try {
    if (!usePwaStore.getState().updateAvailable) {
      await callSeam('registration.checkForUpdate', () => pwa.registration.checkForUpdate(), { quiet: true })
      await updateWaiting(INSTALL_WAIT_MS)
    }
    if (usePwaStore.getState().updateAvailable) {
      await callSeam('registration.applyUpdate', () => pwa.registration.applyUpdate(), { quiet: true })
      await sleep(TAKEOVER_WAIT_MS)
    }
  } catch {
    // callSeam has already logged the failure; the page still has to end up reloaded.
  }
  window.location.reload()
}
