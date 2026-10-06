import type { NetLogEntry } from '@/lib/api/net-log'
import type { JoinedRow, NetClass } from './NetworkJoin'

export const STATUS_CLASSES = ['2xx', '3xx', '4xx', '5xx', 'failed'] as const
export type StatusClass = (typeof STATUS_CLASSES)[number]

export const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

export interface NetFilters {
  cls: NetClass | 'all'
  status: StatusClass | 'all'
  method: string
  text: string
  anomaliesOnly: boolean
  hideProbes: boolean
}

export const NO_FILTERS: NetFilters = { cls: 'all', status: 'all', method: 'all', text: '', anomaliesOnly: false, hideProbes: false }

export const filtersActive = (f: NetFilters): boolean => f.cls !== 'all' || f.status !== 'all' || f.method !== 'all' || f.text.trim() !== '' || f.anomaliesOnly || f.hideProbes

export function statusClassOf(row: Pick<JoinedRow, 'status' | 'failed'>): StatusClass {
  if (row.failed || row.status === 0) return 'failed'
  if (row.status >= 500) return '5xx'
  if (row.status >= 400) return '4xx'
  if (row.status >= 300) return '3xx'
  return '2xx'
}

export function applyFilters(rows: readonly JoinedRow[], f: NetFilters): JoinedRow[] {
  const text = f.text.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.cls !== 'all' && r.cls !== f.cls) return false
    if (f.status !== 'all' && statusClassOf(r) !== f.status) return false
    if (f.method !== 'all' && r.method !== f.method) return false
    if (f.anomaliesOnly && !r.anomaly) return false
    if (f.hideProbes && r.probe) return false
    if (text && !r.path.toLowerCase().includes(text)) return false
    return true
  })
}

/** Nearest-rank percentile of an unsorted list; null when empty. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
  return sorted[Math.min(sorted.length, rank) - 1] ?? null
}

export interface NetSummary {
  /** Rows per class. Server-only excludes static page resources, which are counted apart. */
  counts: Record<NetClass, number>
  /** Server-only rows that are scripts, fonts, images and documents: expected, and not what SERVER ONLY is looking for. */
  pageResources: number
  /** Client requests that got a verdict (everything except no-verdict). */
  judged: number
  cacheRatio: number | null
  /** Cache share per time bucket, oldest first, in percent. */
  cacheTrend: number[]
  p50: number | null
  p95: number | null
  errors: number
  clientTotal: number
}

const TREND_BUCKETS = 12

export function summarise(rows: readonly JoinedRow[], client: readonly NetLogEntry[]): NetSummary {
  const counts: Record<NetClass, number> = { network: 0, cache: 0, 'server-only': 0, 'pre-server': 0, chaos: 0, 'no-verdict': 0 }
  let pageResources = 0
  for (const r of rows) {
    if (r.cls === 'server-only' && r.pageResource) pageResources += 1
    else counts[r.cls] += 1
  }

  const judgedClient = rows.filter((r) => r.client && r.cls !== 'no-verdict').reverse()
  const judged = judgedClient.length
  const cacheRatio = judged === 0 ? null : counts.cache / judged
  const size = Math.max(1, Math.ceil(judged / TREND_BUCKETS))
  const cacheTrend: number[] = []
  for (let i = 0; i < judged; i += size) {
    const slice = judgedClient.slice(i, i + size)
    cacheTrend.push((slice.filter((r) => r.cls === 'cache').length / slice.length) * 100)
  }

  const latencies = client.filter((c) => c.status > 0 && c.errorKind !== 'aborted').map((c) => c.durationMs)
  return {
    counts,
    pageResources,
    judged,
    cacheRatio,
    cacheTrend,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    errors: client.filter((c) => c.errorKind !== null).length,
    clientTotal: client.length,
  }
}
