import type { ResponseMeta, ResponseSource } from '@/lib/api/types'
import { AppError, type AppErrorKind } from '@/lib/errors/app-error'

export function meta(source: ResponseSource, over: Partial<ResponseMeta> = {}): ResponseMeta {
  const swStamped = source.startsWith('sw-')
  return {
    url: '/api/dispatches?limit=12',
    method: 'GET',
    status: 200,
    requestId: source === 'network' || source === 'sw-network' ? 'rq-4f9a1c' : null,
    servedAt: '2026-09-30T08:10:02.118Z',
    servedBy: 'outpost/k7m2',
    fetchedAt: '2026-09-30T08:14:04.402Z',
    durationMs: source === 'network' ? 184 : source === 'unknown' ? 91 : 6,
    source,
    sourceReason: source === 'network' ? 'heuristic:transferSize>0, no SW header' : source === 'unknown' ? 'no evidence either way' : swStamped ? `header:X-SW-Source=${source.slice(3)}` : 'heuristic:transferSize=0',
    dataAgeMs: source === 'network' ? 1200 : 242_000,
    etag: 'W/"dispatches-r41"',
    cacheControl: 'no-cache',
    ageHeader: null,
    rev: 41,
    apiVersion: 1,
    chaos: null,
    swSource: swStamped ? source.slice(3) : null,
    swStrategy: swStamped ? 'stale-while-revalidate' : null,
    swCache: swStamped ? 'api-v3' : null,
    swCachedAt: source === 'sw-cache' ? '2026-09-30T08:10:03.000Z' : null,
    bytes: 18_420,
    transferSize: source === 'network' || source === 'sw-network' ? 4_812 : 0,
    deliveryType: source === 'sw-cache' || source === 'http-cache' ? 'cache' : '',
    redirected: false,
    responseType: 'basic',
    ...over,
  }
}

export function fault(kind: AppErrorKind, message: string, context: AppError['context'] = {}): AppError {
  return new AppError({ kind, message, context })
}

export const DISPATCHES = [
  { id: 'dp-000148', code: 'KRN-07', title: 'Relay mast icing above 40 m, guy wires loaded', severity: 'urgent', at: '06:41', by: 'HALDEN', tags: ['mast', 'icing'], unread: true },
  { id: 'dp-000147', code: 'VLK-02', title: 'Barometer dropped 11 hPa in three hours', severity: 'notice', at: '05:58', by: 'OSKA', tags: ['weather'], unread: true },
  { id: 'dp-000146', code: 'TAL-11', title: 'Generator two swapped, hour meter reset to zero', severity: 'routine', at: '04:20', by: 'BRANN', tags: ['power'], unread: false },
  { id: 'dp-000145', code: 'NRD-04', title: 'Sea ice break-up at the landing, supply drop slipped one day', severity: 'critical', at: '02:12', by: 'ISELIN', tags: ['ice', 'supply', 'landing'], unread: true },
] as const

export const SERIES = [12, 14, 13, 18, 22, 19, 25, 31, 28, 34, 30, 41]
export const STATIONS = [
  { code: 'KRN-07', name: 'Kirna Ridge', kind: 'radio-relay', crew: 3, elevation: 1840, status: 'online', contact: '2 min' },
  { code: 'VLK-02', name: 'Valkeri Flats', kind: 'weather', crew: 2, elevation: 212, status: 'degraded', contact: '47 min' },
  { code: 'TAL-11', name: 'Talgrenn Hut', kind: 'glacier', crew: 4, elevation: 1102, status: 'online', contact: '9 min' },
  { code: 'NRD-04', name: 'North Reach', kind: 'coastal', crew: 1, elevation: 18, status: 'dark', contact: '3 d 4 h' },
] as const
