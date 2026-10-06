import { API } from '@shared/contracts'
import { AppError, checkVersionNow, useVersionStatus } from '@/lib'
import { endpoints } from '@/lib/queries'
import { sleep } from './ErrorsScenarioHelpers'
import type { Outcome } from './ErrorsScenarioTypes'

const RAISED_MIN_CLIENT = '99.0.0'
const GATE_ATTEMPTS = 4
const HOLD_MS = 5000

/** The relay's real minClient, while ours is raised. Null when nothing of ours is in effect. */
let original: string | null = null
let forgetUnloadGuard: (() => void) | null = null

/**
 * The blocking gate cannot be dismissed, and a reload would leave the relay demanding 99.0.0 for good.
 * So the restore is also sent as the page goes away. keepalive is what lets a request outlive the page;
 * apiFetch does not offer it, and this is lab control traffic, not app data.
 */
function guardUnload(minClient: string): () => void {
  const restore = (): void => {
    void fetch(API.lab.release, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minClient }), keepalive: true })
  }
  window.addEventListener('pagehide', restore)
  return () => window.removeEventListener('pagehide', restore)
}

export const versionSkewRaised = (): boolean => original !== null

/** Puts the relay's minClient back. Resolves false when there was nothing to undo. */
export async function undoVersionSkew(): Promise<boolean> {
  if (original === null) return false
  await endpoints.putRelease({ minClient: original })
  original = null
  forgetUnloadGuard?.()
  forgetUnloadGuard = null
  await checkVersionNow()
  return true
}

async function gateAppeared(): Promise<boolean> {
  for (let attempt = 0; attempt < GATE_ATTEMPTS; attempt++) {
    await checkVersionNow()
    if (useVersionStatus.getState().skew === 'update-required') return true
    await sleep(700)
  }
  return false
}

/** Raises minClient, waits for the gate, holds it for a few seconds, then puts minClient back whatever happened. */
export async function holdVersionSkew(): Promise<Outcome> {
  if (original !== null) return { note: 'minClient is already raised. Use Undo.' }
  const { data } = await endpoints.getLabState()
  original = data.release.minClient
  forgetUnloadGuard = guardUnload(original)
  try {
    await endpoints.putRelease({ minClient: RAISED_MIN_CLIENT })
    if (!(await gateAppeared())) return { note: 'The relay now demanded 99.0.0 but the version check never saw it, so no gate appeared. minClient was put back.' }
    await sleep(HOLD_MS)
    const { running } = useVersionStatus.getState()
    const error = new AppError({
      kind: 'version-skew',
      message: `This tab runs ${running.version}; the relay required at least ${RAISED_MIN_CLIENT}.`,
      context: { source: 'lab:simulator', running: running.version, minClient: RAISED_MIN_CLIENT },
    })
    return { error, file: true, note: `The gate blocked the app for ${HOLD_MS / 1000} s. minClient is back at ${data.release.minClient}.` }
  } finally {
    await undoVersionSkew()
  }
}
