import { queryOptions, skipToken } from '@tanstack/react-query'
import { API, type HandbookChapter, type HandbookIndex } from '@shared/contracts'
import * as endpoints from './endpoints'
import { qk } from './keys'
import { useApiQuery, type ApiQuery } from './shared'

/** The handbook only changes when the lab release simulator bumps its edition, so ten minutes is conservative. */
export const HANDBOOK_STALE_MS = 10 * 60_000

export const handbookIndexQueryOptions = () =>
  queryOptions({
    queryKey: qk.handbookIndex(),
    queryFn: ({ signal }) => endpoints.getHandbookIndex({ signal }),
    staleTime: HANDBOOK_STALE_MS,
    meta: { url: API.handbook },
  })

export const handbookChapterQueryOptions = (slug: string | undefined) =>
  queryOptions({
    queryKey: qk.handbookChapter(slug ?? ''),
    queryFn: slug === undefined ? skipToken : ({ signal }) => endpoints.getHandbookChapter(slug, { signal }),
    staleTime: HANDBOOK_STALE_MS,
    meta: { url: API.handbookChapter(slug ?? '') },
  })

export const useHandbookIndex = (): ApiQuery<HandbookIndex> => useApiQuery(handbookIndexQueryOptions())

/** Chapters carry the edition they belong to: compare it with the index's to spot a half-updated cache. */
export const useHandbookChapter = (slug: string | undefined): ApiQuery<HandbookChapter> => useApiQuery(handbookChapterQueryOptions(slug))
