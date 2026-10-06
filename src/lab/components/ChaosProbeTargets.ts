import { z } from 'zod'
import { API, BENCH_STRATEGIES, BenchResponse, DispatchPage, Dispatch, HandbookIndex, SignalBoard, StationList } from '@shared/contracts'

export interface ProbeTarget {
  id: string
  label: string
  method: 'GET' | 'HEAD'
  /** Static path, or a function that picks one when the probe fires (the asset path depends on the running build). */
  path: string | ((assetPath: string | null) => string)
  schema: z.ZodType<unknown>
  /** The body is JSON and is parsed: body modes (corrupt, empty, html, truncate) and schema drift can show. False: headers only. */
  body: boolean
  /** A 204 or headers-only answer is fine. */
  allowEmpty: boolean
  /** Set when the browser's HTTP cache would answer before the server sees the request and hide the fault. */
  cache?: RequestCache
  note: string
}

const json = (id: string, label: string, path: string, schema: z.ZodType<unknown>, note: string): ProbeTarget => ({ id, label, method: 'GET', path, schema, body: true, allowEmpty: false, note })

export const FALLBACK_ASSET = '/assets/outpost-probe.js'

export const PROBE_TARGETS: readonly ProbeTarget[] = [
  json('dispatches', 'Dispatch list', `${API.dispatches}?limit=12`, DispatchPage, 'Validated as a dispatch page, so schema drift shows as schema-mismatch.'),
  json('dispatch', 'Single dispatch', API.dispatch('dp-000001'), Dispatch, 'Carries an ETag: a conditional request can come back 304.'),
  json('stations', 'Stations', API.stations, StationList, 'Not affected by schema drift.'),
  json('signal', 'Signal board', API.signal, SignalBoard, 'Always no-store; seq rises on every call.'),
  ...BENCH_STRATEGIES.map((s) => json(`bench-${s}`, `Bench: ${s}`, API.bench(s, 'alpha'), BenchResponse, 'Same data as the other four strategies, on its own URL so a worker can match it separately.')),
  json('handbook', 'Handbook index', API.handbook, HandbookIndex, 'The cache-only showcase.'),
  {
    id: 'media',
    label: 'Media SVG (headers only)',
    method: 'HEAD',
    path: API.media.station('KRN-07'),
    schema: z.unknown(),
    body: false,
    allowEmpty: true,
    note: 'An image, not JSON, so it is probed with HEAD: status, latency and X-Chaos are visible, bodies are not.',
  },
  {
    id: 'asset',
    label: 'An /assets/ file (headers only)',
    method: 'HEAD',
    path: (assetPath) => assetPath ?? FALLBACK_ASSET,
    schema: z.unknown(),
    body: false,
    allowEmpty: true,
    cache: 'reload',
    note: 'Picks a script this page really loaded and skips the browser HTTP cache (these files are immutable, so the server would otherwise never see the request). Under npm run dev Vite serves /assets/, not the chaos server; use npm run pwa.',
  },
  { id: 'ping', label: 'Ping', method: 'GET', path: API.ping, schema: z.unknown(), body: false, allowEmpty: true, note: 'The reachability probe: 204 and no body. Any GET rule with latency slows it down.' },
]

export const targetById = (id: string): ProbeTarget => PROBE_TARGETS.find((t) => t.id === id) ?? (PROBE_TARGETS[0] as ProbeTarget)
export const resolvePath = (t: ProbeTarget, assetPath: string | null): string => (typeof t.path === 'string' ? t.path : t.path(assetPath))
