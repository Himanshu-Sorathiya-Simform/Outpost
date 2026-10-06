/** Control characters other than tab and newline, plus the bidirectional overrides used to disguise text. */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g

/** One line: controls removed, whitespace collapsed, clipped. For anything arriving from outside (links, share sheets). */
export function cleanLine(text: string, max: number): string {
  return text.replace(UNSAFE, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Several lines: controls removed, line endings normalised, blank runs collapsed, clipped. */
export function cleanBlock(text: string, max: number): string {
  return text
    .replace(UNSAFE, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

export interface Clipped {
  value: string
  /** Characters cut off because the text was longer than `max`. */
  dropped: number
}

/** `cleanLine`, but says how many characters did not fit. */
export function clipLine(text: string, max: number): Clipped {
  const whole = cleanLine(text, Number.POSITIVE_INFINITY)
  return { value: whole.slice(0, max).trimEnd(), dropped: Math.max(0, whole.length - max) }
}

/** `cleanBlock`, but says how many characters did not fit. */
export function clipBlock(text: string, max: number): Clipped {
  const whole = cleanBlock(text, Number.POSITIVE_INFINITY)
  return { value: whole.slice(0, max).trimEnd(), dropped: Math.max(0, whole.length - max) }
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/i
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>'"]+$/

/** http(s) only. Anything else (javascript:, data:, file:, relative) is not a link we will carry. */
export function webUrl(text: string): string | null {
  const candidate = text.trim()
  if (candidate === '' || candidate.length > 2000) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** The first web address inside free text; Android share sheets often put the link in `text`. */
export function firstUrlIn(text: string): string | null {
  const hit = URL_IN_TEXT.exec(text)
  return hit ? webUrl(hit[0].replace(TRAILING_PUNCTUATION, '')) : null
}
