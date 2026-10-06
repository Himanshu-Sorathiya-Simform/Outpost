import { create } from 'zustand'
import { refCounted } from '@/lib/lifecycle'

export const RESOURCE_RING_SIZE = 400
/** The browser's default buffer is 250 entries and silently drops the rest, which would blind apiFetch's timing lookup. */
const RESOURCE_TIMING_BUFFER = 1000

export type ResourceCategory = 'script' | 'style' | 'font' | 'image' | 'fetch' | 'document' | 'other'

export interface ResourceEntry {
  id: number
  /** Absolute URL as the browser saw it. */
  name: string
  /** Same-origin URLs shortened to path + query. */
  path: string
  initiatorType: string
  category: ResourceCategory
  /** performance.now() based start. */
  startTime: number
  /** Wall-clock epoch ms of the start. */
  at: number
  duration: number
  /** 0 = nothing crossed the network (cache), unless the origin hides sizes (cross-origin without Timing-Allow-Origin). */
  transferSize: number
  encodedBodySize: number
  decodedBodySize: number
  /** '' (network) or 'cache' (Chromium: HTTP cache or service worker). */
  deliveryType: string
  nextHopProtocol: string
  responseStatus: number
  /** deliveryType 'cache', or transferSize 0 with a body. */
  fromCache: boolean
}

interface ResourceLogState {
  /** Newest first. */
  entries: ResourceEntry[]
  clear(): void
}

export const useResourceLog = create<ResourceLogState>((set) => ({
  entries: [],
  clear: () => set({ entries: [] }),
}))

type TimingWithDelivery = PerformanceResourceTiming & { deliveryType?: string }

export function categorise(initiatorType: string, name: string): ResourceCategory {
  if (initiatorType === 'fetch' || initiatorType === 'xmlhttprequest' || initiatorType === 'beacon') return 'fetch'
  if (initiatorType === 'script') return 'script'
  if (initiatorType === 'img' || initiatorType === 'image') return 'image'
  if (initiatorType === 'navigation' || initiatorType === 'iframe') return 'document'
  const path = name.split(/[?#]/, 1)[0] ?? name
  if (/\.(woff2?|ttf|otf)$/i.test(path)) return 'font'
  if (initiatorType === 'css' || initiatorType === 'link') return /\.css$/i.test(path) ? 'style' : /\.(js|mjs)$/i.test(path) ? 'script' : 'other'
  return 'other'
}

let nextId = 0

export function toResourceEntry(e: PerformanceResourceTiming, origin: string, timeOrigin: number): ResourceEntry {
  const deliveryType = (e as TimingWithDelivery).deliveryType ?? ''
  const path = e.name.startsWith(origin) ? e.name.slice(origin.length) || '/' : e.name
  return {
    id: ++nextId,
    name: e.name,
    path,
    initiatorType: e.initiatorType,
    category: categorise(e.initiatorType, e.name),
    startTime: e.startTime,
    at: Math.round(timeOrigin + e.startTime),
    duration: Math.round(e.duration),
    transferSize: e.transferSize,
    encodedBodySize: e.encodedBodySize,
    decodedBodySize: e.decodedBodySize,
    deliveryType,
    nextHopProtocol: e.nextHopProtocol,
    responseStatus: e.responseStatus,
    fromCache: deliveryType === 'cache' || (e.transferSize === 0 && e.encodedBodySize > 0),
  }
}

/** A request is identified by what it loaded and when it started; the same URL fetched again starts at another time. */
const identity = (e: Pick<ResourceEntry, 'name' | 'startTime'>): string => `${e.startTime}|${e.name}`

/**
 * Append a batch to the ring: newest first, bounded. Entries already in the ring are skipped, because an observer
 * that is stopped and started again (hot reload, StrictMode) is handed the whole buffered timeline a second time.
 */
export function appendResources(batch: readonly ResourceEntry[]): void {
  if (batch.length === 0) return
  useResourceLog.setState((s) => {
    const known = new Set(s.entries.map(identity))
    const fresh = batch.filter((e) => {
      const key = identity(e)
      if (known.has(key)) return false
      known.add(key)
      return true
    })
    if (fresh.length === 0) return s
    return { entries: [...fresh.reverse(), ...s.entries].slice(0, RESOURCE_RING_SIZE) }
  })
}

/**
 * Observes every resource the page loads (scripts, lazy chunks, fonts, images, fetch) through PerformanceObserver,
 * including loads that never pass through apiFetch. Idempotent; returns a disposer.
 */
export const startResourceLog = refCounted((): (() => void) => {
  // supportedEntryTypes is missing in older engines; without it there is no way to know, so do not guess.
  if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('resource')) return () => undefined

  const origin = location.origin
  const convert = (list: PerformanceEntryList): ResourceEntry[] =>
    (list as PerformanceResourceTiming[]).map((e) => toResourceEntry(e, origin, performance.timeOrigin))

  const observer = new PerformanceObserver((list) => appendResources(convert(list.getEntries())))
  observer.observe({ type: 'resource', buffered: true })

  performance.setResourceTimingBufferSize(RESOURCE_TIMING_BUFFER)
  // The observer has already copied everything into the ring, so a full browser buffer can simply be emptied.
  const onBufferFull = (): void => performance.clearResourceTimings()
  performance.addEventListener('resourcetimingbufferfull', onBufferFull)

  return () => {
    observer.disconnect()
    performance.removeEventListener('resourcetimingbufferfull', onBufferFull)
  }
})
