import { create } from 'zustand'
import { z } from 'zod'
import { API, API_VERSION, VersionInfo } from '@shared/contracts'
import { apiFetch, observeApiVersion } from '@/lib/api/client'
import { AppError, type AppErrorKind } from '@/lib/errors/app-error'
import { refCounted } from '@/lib/lifecycle'
import { getLabSettings, useLabSettings } from '@/lib/settings/lab-settings'
import { isOlder } from './semver'

/** Shape of /version.json, emitted by the build (vite.config.ts). */
export const BuildInfo = z.object({ version: z.string(), buildId: z.string(), builtAt: z.string() })
export type BuildInfo = z.infer<typeof BuildInfo>

export type Skew = 'none' | 'update-available' | 'update-required' | 'api-mismatch'

export interface VersionStatus {
  /** What this tab is actually running (baked in at build time). */
  running: BuildInfo
  /** What GET /api/version last said: the server's opinion of which client is current and which is too old. */
  server: VersionInfo | null
  /** What /version.json (the deployed static files) last said. */
  deployed: BuildInfo | null
  /** The API version the server speaks when it differs from the one this client was written for; otherwise null. */
  apiMismatch: number | null
  skew: Skew
  /** The deployed buildId differs from the running one: a new deploy is live and this tab is stale. */
  newDeploy: boolean
  /** A lazy chunk failed to load (vite:preloadError): the usual symptom of newDeploy. */
  chunkLoadFailed: boolean
  /** Epoch ms of the last completed check, successful or not. */
  lastCheckedAt: number | null
  /** Kind of the failure that stopped the last check; null when it went through. */
  lastCheckError: AppErrorKind | null
  /** Last X-Api-Version seen on any response. Input to `apiMismatch`. */
  seenApiVersion: number | null
}

type VersionInputs = Pick<VersionStatus, 'running' | 'server' | 'deployed' | 'seenApiVersion'>
type Derived = Pick<VersionStatus, 'apiMismatch' | 'skew' | 'newDeploy'>

/**
 * Derives the website-level update signals. Precedence of skew: update-required (the server refuses this version)
 * over api-mismatch (the wire format moved) over update-available (merely behind).
 */
export function deriveVersionStatus({ running, server, deployed, seenApiVersion }: VersionInputs): Derived {
  const apiMismatch = seenApiVersion !== null && seenApiVersion !== API_VERSION ? seenApiVersion : null
  let skew: Skew = 'none'
  if (server && isOlder(running.version, server.minClient)) skew = 'update-required'
  else if (apiMismatch !== null) skew = 'api-mismatch'
  else if (server && isOlder(running.version, server.latestClient)) skew = 'update-available'
  return { apiMismatch, skew, newDeploy: deployed !== null && deployed.buildId !== running.buildId }
}

const running: BuildInfo = { version: __APP_VERSION__, buildId: __BUILD_ID__, builtAt: __BUILD_TIME__ }

export const useVersionStatus = create<VersionStatus>(() => ({
  running,
  server: null,
  deployed: null,
  seenApiVersion: null,
  chunkLoadFailed: false,
  lastCheckedAt: null,
  lastCheckError: null,
  ...deriveVersionStatus({ running, server: null, deployed: null, seenApiVersion: null }),
}))

function update(patch: Partial<VersionInputs> & Partial<Pick<VersionStatus, 'chunkLoadFailed' | 'lastCheckedAt' | 'lastCheckError'>>): void {
  useVersionStatus.setState((s) => {
    const next = { ...s, ...patch }
    return { ...patch, ...deriveVersionStatus(next) }
  })
}

/** Called by the global handlers when a dynamic import fails. */
export function markChunkLoadFailed(): void {
  update({ chunkLoadFailed: true })
}

let checking: Promise<void> | null = null

/** Polls /api/version and /version.json (never from any cache). Failures are recorded here, not in the error centre. */
export function checkVersionNow(): Promise<void> {
  checking ??= runCheck().finally(() => {
    checking = null
  })
  return checking
}

async function runCheck(): Promise<void> {
  const [server, deployed] = await Promise.allSettled([
    apiFetch({ path: API.version, schema: VersionInfo, cache: 'no-store' }),
    apiFetch({ path: '/version.json', schema: BuildInfo, cache: 'no-store' }),
  ])
  const failure = [server, deployed].find((r): r is PromiseRejectedResult => r.status === 'rejected')
  const failureKind: AppErrorKind | null = failure ? (AppError.is(failure.reason) ? failure.reason.kind : 'unknown') : null
  update({
    // A failed half keeps its previous value: stale knowledge beats forgetting that an update was announced.
    ...(server.status === 'fulfilled' ? { server: server.value.data, seenApiVersion: server.value.data.api } : {}),
    ...(deployed.status === 'fulfilled' ? { deployed: deployed.value.data } : {}),
    lastCheckedAt: Date.now(),
    lastCheckError: failureKind,
  })
}

const MIN_CHECK_GAP_MS = 2000

/**
 * Checks on start, on focus, when the network returns, and every `deployWatchSec` (lab setting, 0 = off).
 * Also listens for X-Api-Version on every apiFetch response. Idempotent; returns a disposer.
 */
export const startVersionWatcher = refCounted((): (() => void) => {
  let timer: ReturnType<typeof setInterval> | null = null
  let lastCheckStarted = 0

  const check = (): void => {
    const now = Date.now()
    if (now - lastCheckStarted < MIN_CHECK_GAP_MS) return
    lastCheckStarted = now
    void checkVersionNow()
  }
  const schedule = (): void => {
    if (timer) clearInterval(timer)
    timer = null
    const { deployWatchSec } = getLabSettings()
    if (deployWatchSec > 0) timer = setInterval(check, deployWatchSec * 1000)
  }
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') check()
  }

  const stopApiVersion = observeApiVersion((seenApiVersion) => {
    if (useVersionStatus.getState().seenApiVersion !== seenApiVersion) update({ seenApiVersion })
  })
  const unsubscribe = useLabSettings.subscribe((s, prev) => {
    if (s.deployWatchSec !== prev.deployWatchSec) schedule()
  })
  window.addEventListener('focus', check)
  window.addEventListener('online', check)
  document.addEventListener('visibilitychange', onVisible)

  schedule()
  check()

  return () => {
    if (timer) clearInterval(timer)
    stopApiVersion()
    unsubscribe()
    window.removeEventListener('focus', check)
    window.removeEventListener('online', check)
    document.removeEventListener('visibilitychange', onVisible)
  }
})
