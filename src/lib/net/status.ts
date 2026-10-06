import { create } from 'zustand'
import { API, HDR } from '@shared/contracts'
import type { AppErrorKind } from '@/lib/errors/app-error'
import { refCounted } from '@/lib/lifecycle'
import { getLabSettings, useLabSettings } from '@/lib/settings/lab-settings'
import { getTabId } from '@/lib/tabs/tab-sync'

export const PROBE_TIMEOUT_MS = 3000
const MIN_PROBE_GAP_MS = 1000
const BACKOFF_BASE_MS = 2000

export type ServerReach = 'unknown' | 'reachable' | 'unreachable'

export interface NetStatus {
  /** navigator.onLine: only says a network interface is up, not that anything answers. */
  browserOnline: boolean
  /** Did the last probe of HEAD /api/ping get a real answer from the app's own server? */
  server: ServerReach
  /** Browser says online but the server does not answer: the lie-fi state. */
  lieFi: boolean
  /** Epoch ms of the last completed probe. */
  lastProbeAt: number | null
  /** Round trip of the last successful probe. */
  lastLatencyMs: number | null
}

const initialOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine

export const useNetStatus = create<NetStatus>(() => ({
  browserOnline: initialOnline(),
  server: 'unknown',
  lieFi: false,
  lastProbeAt: null,
  lastLatencyMs: null,
}))

export const getNetStatus = (): NetStatus => useNetStatus.getState()

let consecutiveFailures = 0

function setBrowserOnline(browserOnline: boolean): void {
  useNetStatus.setState((s) => ({ browserOnline, lieFi: browserOnline && s.server === 'unreachable' }))
}

function setServer(server: ServerReach, latencyMs: number | null, probed = true): void {
  consecutiveFailures = server === 'unreachable' ? consecutiveFailures + 1 : 0
  useNetStatus.setState((s) => ({
    server,
    lieFi: s.browserOnline && server === 'unreachable',
    lastProbeAt: probed ? Date.now() : s.lastProbeAt,
    lastLatencyMs: latencyMs ?? s.lastLatencyMs,
  }))
}

/**
 * The probe only needs to know whether OUR server answered. Any HTTP status counts as an answer (a 503 means the
 * box is up) as long as it carries the X-Served-By stamp the server puts on every response, errors and injected
 * faults included. That rules out the impostors: a captive portal, a proxy's error page, and a service worker
 * answering for itself (a worker that returns its own 503 or 200 HTML when the network is gone), whether or not
 * it also marks the response with X-SW-Source.
 */
function answeredByServer(res: Response): boolean {
  if (!res.headers.has(HDR.servedBy)) return false
  const swSource = res.headers.get(HDR.swSource)
  if (swSource === 'cache' || swSource === 'fallback' || swSource === 'cache-miss') return false
  return !(res.ok && (res.headers.get('content-type') ?? '').includes('html'))
}

let inflight: Promise<void> | null = null

/** One probe at a time: callers arriving mid-flight share its result. */
export function probeNow(): Promise<void> {
  inflight ??= runProbe().finally(() => {
    inflight = null
  })
  return inflight
}

async function runProbe(): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  const started = performance.now()
  try {
    const res = await fetch(API.ping, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', signal: controller.signal, headers: { [HDR.tab]: getTabId() } })
    if (answeredByServer(res)) setServer('reachable', Math.round(performance.now() - started))
    else setServer('unreachable', null)
  } catch {
    // Transport failure, timeout or an offline browser: all mean "not reachable". Never an error-centre entry.
    setServer('unreachable', null)
  } finally {
    clearTimeout(timer)
  }
}

let monitorRunning = false
let lastProbeRequestAt = 0

/**
 * An apiFetch failed at transport level. If the monitor is running, verify whether the server is really gone
 * (cheap, and debounced so a burst of failing queries causes one probe).
 */
export function noteApiFailure(kind: AppErrorKind): void {
  if (!monitorRunning || (kind !== 'network' && kind !== 'timeout')) return
  const now = Date.now()
  if (now - lastProbeRequestAt < MIN_PROBE_GAP_MS) return
  lastProbeRequestAt = now
  void probeNow()
}

/** A real server answered an app request: stronger evidence than the next scheduled probe. */
export function noteApiReachable(): void {
  if (useNetStatus.getState().server !== 'reachable') setServer('reachable', null, false)
}

/** Delay before the next scheduled probe: the configured interval, or a shorter backoff while the server is down. */
export function nextProbeDelayMs(intervalSec: number, failures: number, random: () => number = Math.random): number {
  const interval = intervalSec * 1000
  const base = failures === 0 ? interval : Math.min(interval, BACKOFF_BASE_MS * 2 ** (failures - 1))
  return Math.round(base * (0.8 + random() * 0.4))
}

/**
 * Probes HEAD /api/ping on start, on online/offline/focus/visibility events, on an interval (lab setting), and
 * after transport-level API failures. Idempotent; returns a disposer.
 */
export const startNetMonitor = refCounted((): (() => void) => {
  monitorRunning = true
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    // A probe that was in flight when the monitor stopped still ends in schedule(); it must not start a new cycle.
    if (stopped) return
    const { probeIntervalSec } = getLabSettings()
    if (probeIntervalSec <= 0) return
    timer = setTimeout(() => void probeNow().finally(schedule), nextProbeDelayMs(probeIntervalSec, consecutiveFailures))
  }
  const probeAndReschedule = (): void => {
    void probeNow().finally(schedule)
  }

  const onOnline = (): void => {
    setBrowserOnline(true)
    probeAndReschedule()
  }
  const onOffline = (): void => {
    setBrowserOnline(false)
    probeAndReschedule()
  }
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') probeAndReschedule()
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  window.addEventListener('focus', probeAndReschedule)
  document.addEventListener('visibilitychange', onVisibility)
  const unsubscribe = useLabSettings.subscribe((s, prev) => {
    if (s.probeIntervalSec !== prev.probeIntervalSec) schedule()
  })

  setBrowserOnline(initialOnline())
  probeAndReschedule()

  return () => {
    stopped = true
    monitorRunning = false
    if (timer) clearTimeout(timer)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('focus', probeAndReschedule)
    document.removeEventListener('visibilitychange', onVisibility)
    unsubscribe()
  }
})
