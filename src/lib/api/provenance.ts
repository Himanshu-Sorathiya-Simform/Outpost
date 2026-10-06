import { HDR } from '@shared/contracts'
import type { ResponseSource } from './types'

/** The bits of PerformanceResourceTiming that decide provenance. */
export interface TimingInfo {
  transferSize: number
  encodedBodySize: number
  decodedBodySize: number
  /** Chromium: 'cache' when the HTTP cache or a service worker supplied the bytes; '' otherwise. Empty where unsupported. */
  deliveryType: string
}

export interface ProvenanceInput {
  /** Value of the X-SW-Source response header, if any. */
  swSource: string | null
  timing: TimingInfo | null
  /** A service worker currently controls this page. */
  hasController: boolean
}

export interface Provenance {
  source: ResponseSource
  /** Why: 'header:X-SW-Source=cache', 'heuristic:deliveryType=cache+controller', ... */
  reason: string
}

/**
 * Decides where a response physically came from. Precedence, strongest evidence first:
 *   1. X-SW-Source header. Only your own service worker can set it, so it is authoritative:
 *        cache → sw-cache · network | revalidated → sw-network · fallback | cache-miss → sw-fallback
 *   2. Resource timing: deliveryType 'cache', or transferSize 0 with a non-empty body.
 *        With a controlling service worker → sw-cache, otherwise → http-cache.
 *      (A worker that never stamps the header but answers from Cache Storage looks exactly like this.)
 *   3. Otherwise → network.
 * Nothing here can prove a negative: a worker that streams from the network without the header reads as 'network'.
 */
export function decideSource({ swSource, timing, hasController }: ProvenanceInput): Provenance {
  const header = swSource?.trim().toLowerCase() ?? null
  if (header === 'cache') return { source: 'sw-cache', reason: `header:${HDR.swSource}=cache` }
  if (header === 'network' || header === 'revalidated') return { source: 'sw-network', reason: `header:${HDR.swSource}=${header}` }
  if (header === 'fallback' || header === 'cache-miss') return { source: 'sw-fallback', reason: `header:${HDR.swSource}=${header}` }

  if (timing) {
    const byDelivery = timing.deliveryType === 'cache'
    const byTransfer = timing.transferSize === 0 && timing.encodedBodySize > 0
    if (byDelivery || byTransfer) {
      const evidence = byDelivery ? 'deliveryType=cache' : 'transferSize=0'
      return hasController
        ? { source: 'sw-cache', reason: `heuristic:${evidence}+controller` }
        : { source: 'http-cache', reason: `heuristic:${evidence}` }
    }
  }

  const ignored = header ? ` (unrecognised ${HDR.swSource}="${swSource}")` : ''
  return { source: 'network', reason: timing ? `default:transferSize=${timing.transferSize}${ignored}` : `default:no-timing-entry${ignored}` }
}

export function hasServiceWorkerController(): boolean {
  try {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null
  } catch {
    return false
  }
}

type TimingSource = Pick<Performance, 'getEntriesByName'>

/**
 * Finds the PerformanceResourceTiming entry for one request. Uses the FINAL url (after redirects) and, because
 * the same URL is often fetched repeatedly, the entry whose start time is closest to when this request began.
 * Never throws: timing is garnish, and the buffer can be full, cleared, or absent.
 */
export function findResourceTiming(
  finalUrl: string,
  startedAt: number,
  endedAt: number,
  perf: TimingSource | undefined = typeof performance === 'undefined' ? undefined : performance,
): TimingInfo | null {
  try {
    if (!perf || typeof perf.getEntriesByName !== 'function') return null
    const slack = 2 // ms: timer granularity between our clock reads and the entry's startTime
    let best: PerformanceResourceTiming | null = null
    for (const entry of perf.getEntriesByName(finalUrl, 'resource') as PerformanceResourceTiming[]) {
      if (entry.startTime < startedAt - slack || entry.startTime > endedAt + slack) continue
      if (!best || Math.abs(entry.startTime - startedAt) < Math.abs(best.startTime - startedAt)) best = entry
    }
    if (!best) return null
    return {
      transferSize: best.transferSize,
      encodedBodySize: best.encodedBodySize,
      decodedBodySize: best.decodedBodySize,
      deliveryType: (best as PerformanceResourceTiming & { deliveryType?: string }).deliveryType ?? '',
    }
  } catch {
    return null
  }
}
