import { LIMITS } from '../form/form-values'
import type { Dropped } from '../form/prefill'
import { cleanLine, clipBlock, clipLine, firstUrlIn, webUrl } from '../form/sanitize'

export interface IncomingShare {
  /** Cleaned title, at most what a dispatch title can hold. */
  title: string
  /** Cleaned text, at most what a dispatch body can hold. */
  text: string
  /** The link to carry into the form (only when it arrived in `url`). */
  url: string | null
  /** A link found inside the text because `url` was empty (Android share sheets do this). It stays in the text. */
  urlInText: string | null
  /** `url` held something that is not an http(s) address, so it was dropped. */
  urlRejected: boolean
  /** Characters that did not fit a dispatch and are not carried over. */
  dropped: Dropped
  /** Anything at all was received. */
  received: boolean
}

/** Reads /share-target?title=&text=&url= . Everything is cleaned; nothing is trusted or acted on. */
export function readShare(params: URLSearchParams): IncomingShare {
  const { value: title, dropped: titleDropped } = clipLine(params.get('title') ?? '', LIMITS.titleMax)
  const { value: text, dropped: textDropped } = clipBlock(params.get('text') ?? '', LIMITS.bodyMax)
  const rawUrl = cleanLine(params.get('url') ?? '', 2000)
  const url = webUrl(rawUrl)
  const urlInText = url === null ? firstUrlIn(text) : null
  return {
    title,
    text,
    url,
    urlInText,
    urlRejected: rawUrl !== '' && url === null,
    dropped: { title: titleDropped, body: textDropped },
    received: title !== '' || text !== '' || rawUrl !== '',
  }
}

/** Short enough to review at a glance; says how much was cut. */
export function preview(text: string, max: number): { shown: string; cut: number } {
  return text.length <= max ? { shown: text, cut: 0 } : { shown: `${text.slice(0, max).trimEnd()}…`, cut: text.length - max }
}

/** A sample share, so the page can be tried without a share sheet. */
export const SAMPLE_SHARE_HREF = `/share-target?${new URLSearchParams({
  title: 'Barometer falling at KRN-07',
  text: 'Pressure down 11 hPa in three hours, wind backing north-west. Field notes at https://example.org/krn-07/log',
}).toString()}`
