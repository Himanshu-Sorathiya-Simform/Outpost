import { errorCenter, safeLocal, checkVersionNow, queryClient } from '@/lib'
import { endpoints, qk } from '@/lib/queries'
import { DEFAULT_RELEASE } from './ServerReleaseScenarios'

/**
 * The version gate is a modal with one button, so nothing on this page can be clicked while it is up. A forced
 * upgrade therefore comes with a timer that lowers minClient again. The deadline is kept in localStorage: after a
 * reload the Server page picks it up and finishes the job.
 */
const KEY = 'outpost.lab.gate-lift'
const RETRY_MS = 5000
const MAX_TRIES = 6

let timer: ReturnType<typeof setTimeout> | null = null

async function lift(tries: number): Promise<void> {
  try {
    await endpoints.putRelease({ minClient: DEFAULT_RELEASE.minClient })
    safeLocal.remove(KEY)
    await queryClient.invalidateQueries({ queryKey: qk.lab.state() })
    await checkVersionNow()
  } catch (err) {
    errorCenter.report(err, { source: 'lab:gate-lift' })
    if (tries < MAX_TRIES) timer = setTimeout(() => void lift(tries + 1), RETRY_MS)
  }
}

function arm(at: number): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void lift(1), Math.max(0, at - Date.now()))
}

/** Lower minClient again in `ms`. Replaces any earlier timer. */
export function scheduleGateLift(ms: number): void {
  const at = Date.now() + ms
  safeLocal.set(KEY, String(at))
  arm(at)
}

/** Forget the timer (the operator undid the release by hand). */
export function cancelGateLift(): void {
  if (timer) clearTimeout(timer)
  timer = null
  safeLocal.remove(KEY)
}

/** Call when the Server page mounts: a deadline left behind by a reload is honoured (immediately, if it has passed). */
export function resumeGateLift(): void {
  if (timer) return
  const stored = Number(safeLocal.get(KEY))
  if (Number.isFinite(stored) && stored > 0) arm(stored)
}
