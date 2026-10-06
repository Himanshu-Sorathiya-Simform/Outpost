import { LIMITS } from './form-values'
import { cleanBlock, cleanLine, clipBlock, clipLine, webUrl } from './sanitize'
import type { FormValues } from './form-values'

/** How much of an incoming title and text did not fit in a dispatch. */
export interface Dropped {
  title: number
  body: number
}

/** One sentence per field that lost characters; empty when everything fitted. */
export function describeDropped(dropped: Dropped): string[] {
  const notes: string[] = []
  if (dropped.title > 0) notes.push(`A title holds ${LIMITS.titleMax} characters. The last ${dropped.title} of this one are dropped.`)
  if (dropped.body > 0) notes.push(`Only the first ${LIMITS.bodyMax} characters fit in a dispatch. The other ${dropped.body} are dropped.`)
  return notes
}

export interface Prefill {
  values: Partial<FormValues>
  /** A station named in the link, raw; ignored later if the list has no such station. */
  hasStation: boolean
  /** Title, text or url arrived, so this entry starts from somebody else's words. */
  hasContent: boolean
  /** `?draft=` if it is shaped like a draft id. */
  draftId: string | null
  dropped: Dropped
}

const DRAFT_ID = /^[A-Za-z0-9-]{1,64}$/
const STATION_PARAM = /^[A-Za-z0-9-]{2,24}$/

/**
 * Reads /file?title=&text=&url=&station=&draft= . Nothing here is trusted: it is cut to length, stripped of
 * control characters, and only http(s) links survive. The url goes on a line of its own after the text.
 */
export function readPrefill(params: URLSearchParams): Prefill {
  const title = clipLine(params.get('title') ?? '', LIMITS.titleMax)
  const text = cleanBlock(params.get('text') ?? '', Number.POSITIVE_INFINITY)
  const url = webUrl(cleanLine(params.get('url') ?? '', 2000))
  const station = (params.get('station') ?? '').trim()
  const draft = (params.get('draft') ?? '').trim()

  const body = clipBlock(url && !text.includes(url) ? (text ? `${text}\n${url}` : url) : text, LIMITS.bodyMax)
  const firstLine = text.split('\n').find((l) => l.trim() !== '') ?? ''
  const host = url ? new URL(url).hostname : ''
  const derivedTitle = title.value || cleanLine(firstLine, LIMITS.titleMax) || (host ? cleanLine(`Link: ${host}`, LIMITS.titleMax) : '')

  const values: Partial<FormValues> = {}
  if (derivedTitle) values.title = derivedTitle
  if (body.value) values.body = body.value
  if (STATION_PARAM.test(station)) values.stationId = station

  return {
    values,
    hasStation: values.stationId !== undefined,
    hasContent: derivedTitle !== '' || body.value !== '',
    draftId: DRAFT_ID.test(draft) ? draft : null,
    dropped: { title: title.dropped, body: body.dropped },
  }
}

/** The /file link for a shared title, text and link (used by the share target page). */
export function composeHref(shared: { title?: string; text?: string; url?: string }): string {
  const params = new URLSearchParams()
  if (shared.title) params.set('title', shared.title)
  if (shared.text) params.set('text', shared.text)
  if (shared.url) params.set('url', shared.url)
  const query = params.toString()
  return query ? `/file?${query}` : '/file'
}
