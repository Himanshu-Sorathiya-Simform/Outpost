import { queryOptions, skipToken } from '@tanstack/react-query'
import { API, type Station, type StationList } from '@shared/contracts'
import * as endpoints from './endpoints'
import { qk } from './keys'
import { useApiQuery, type ApiQuery } from './shared'

/** Stations drift slowly on the server (a status change every few minutes), so a minute of freshness is honest. */
export const STATIONS_STALE_MS = 60_000

export const stationsQueryOptions = () =>
  queryOptions({
    queryKey: qk.stationList(),
    queryFn: ({ signal }) => endpoints.getStations({ signal }),
    staleTime: STATIONS_STALE_MS,
    meta: { url: API.stations },
  })

export const stationQueryOptions = (code: string | undefined) =>
  queryOptions({
    queryKey: qk.station(code ?? ''),
    queryFn: code === undefined ? skipToken : ({ signal }) => endpoints.getStation(code, { signal }),
    staleTime: STATIONS_STALE_MS,
    meta: { url: API.station(code ?? '') },
  })

export const useStations = (): ApiQuery<StationList> => useApiQuery(stationsQueryOptions())

/** `code` is a station code ('KRN-07') or id ('st-krn07'); undefined (an absent route param) keeps the query idle. */
export const useStation = (code: string | undefined): ApiQuery<Station> => useApiQuery(stationQueryOptions(code))
