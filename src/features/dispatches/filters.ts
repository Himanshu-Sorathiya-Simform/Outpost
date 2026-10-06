import { Severity } from '@shared/contracts'
import type { FeedFilters } from '@/lib/queries'

/** The filter set of the log, exactly as it is written in the address bar. */
export interface LogFilterValues {
  severity: Severity | undefined
  station: string | undefined
  q: string
  unread: boolean
  starred: boolean
}

const SEVERITY_PARAM = 'severity'
const STATION_PARAM = 'station'
const QUERY_PARAM = 'q'
const UNREAD_PARAM = 'unread'
const STARRED_PARAM = 'starred'

export function parseLogFilters(params: URLSearchParams): LogFilterValues {
  const severity = Severity.safeParse(params.get(SEVERITY_PARAM))
  return {
    severity: severity.success ? severity.data : undefined,
    station: params.get(STATION_PARAM)?.trim() || undefined,
    q: params.get(QUERY_PARAM) ?? '',
    unread: params.get(UNREAD_PARAM) === '1',
    starred: params.get(STARRED_PARAM) === '1',
  }
}

/** Query-string form of the filters; empty values are left out so that "no filter" is an empty string. */
export function writeLogFilters(values: LogFilterValues): URLSearchParams {
  const params = new URLSearchParams()
  if (values.severity) params.set(SEVERITY_PARAM, values.severity)
  if (values.station) params.set(STATION_PARAM, values.station)
  if (values.q.trim()) params.set(QUERY_PARAM, values.q.trim())
  if (values.unread) params.set(UNREAD_PARAM, '1')
  if (values.starred) params.set(STARRED_PARAM, '1')
  return params
}

export function toFeedFilters(values: LogFilterValues): FeedFilters {
  return {
    severity: values.severity,
    station: values.station,
    q: values.q.trim() || undefined,
    unread: values.unread ? true : undefined,
    starred: values.starred ? true : undefined,
  }
}

/** Number of filters in force; the text search counts once. */
export function countActiveFilters(values: LogFilterValues): number {
  return [values.severity, values.station, values.q.trim(), values.unread, values.starred].filter(Boolean).length
}

/** What the log hands to the detail page through router state, so "back" and "older/newer" keep the same list. */
export interface LogLinkState {
  search: string
}

export function isLogLinkState(value: unknown): value is LogLinkState {
  return typeof value === 'object' && value !== null && 'search' in value && typeof value.search === 'string'
}
