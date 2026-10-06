export type HandleKind = 'dispatch' | 'station' | 'handbook'

export interface HandleTarget {
  kind: HandleKind
  /** The identifier as it will be used, normalised. */
  id: string
  /** The in-app path to open. Built only from an allow-listed identifier. */
  path: string
}

export type HandleFailure = 'missing' | 'too-long' | 'encoded' | 'scheme' | 'resource' | 'identifier'

export type HandleParse = { ok: true; target: HandleTarget } | { ok: false; failure: HandleFailure; message: string }

const MAX_LENGTH = 200
const SHAPE = /^web\+outpost:\/\/([a-z]+)\/([^/?#\s]+)\/?$/i

/** Per resource: what an identifier may look like, how it is normalised, and where it goes. */
const RESOURCES: Record<HandleKind, { pattern: RegExp; normalise: (id: string) => string; path: (id: string) => string }> = {
  dispatch: { pattern: /^dp-\d{1,9}$/i, normalise: (id) => id.toLowerCase(), path: (id) => `/log/${id}` },
  station: { pattern: /^[A-Za-z]{2,5}-\d{1,3}$/, normalise: (id) => id.toUpperCase(), path: (id) => `/stations/${id}` },
  handbook: { pattern: /^[a-z0-9]+(?:-[a-z0-9]+){0,7}$/, normalise: (id) => id, path: (id) => `/handbook/${id}` },
}

const isKind = (value: string): value is HandleKind => Object.hasOwn(RESOURCES, value)

const fail = (failure: HandleFailure, message: string): HandleParse => ({ ok: false, failure, message })

/**
 * Parses the `uri` a protocol handler hands over: web+outpost://dispatch/<id>, .../station/<code>, .../handbook/<slug>.
 * The value from URLSearchParams has already been percent-decoded once, so any '%' left means it was encoded twice
 * and is refused. The result is a path built from a matched identifier, never the input itself.
 */
export function parseHandleUri(raw: string | null): HandleParse {
  if (raw === null || raw.trim() === '') return fail('missing', 'No address was passed in.')
  const uri = raw.trim()
  if (uri.length > MAX_LENGTH) return fail('too-long', `That address is longer than ${MAX_LENGTH} characters.`)
  if (uri.includes('%')) return fail('encoded', 'The address is still percent-encoded after decoding once.')
  if (!/^web\+outpost:\/\//i.test(uri)) return fail('scheme', 'Only web+outpost:// addresses are handled here.')
  const shape = SHAPE.exec(uri)
  const kind = shape?.[1]?.toLowerCase()
  const id = shape?.[2]
  if (!shape || kind === undefined || id === undefined) return fail('resource', 'Expected web+outpost://<dispatch|station|handbook>/<identifier>.')
  if (!isKind(kind)) return fail('resource', `"${kind}" is not something this app opens. Try dispatch, station or handbook.`)
  const rule = RESOURCES[kind]
  if (!rule.pattern.test(id)) return fail('identifier', `That is not a valid ${kind} identifier.`)
  const normalised = rule.normalise(id)
  return { ok: true, target: { kind, id: normalised, path: rule.path(normalised) } }
}

/** One example per kind, for the page that explains the scheme and lets you try it. */
export const HANDLE_EXAMPLES: ReadonlyArray<{ uri: string; meaning: string }> = [
  { uri: 'web+outpost://dispatch/dp-000001', meaning: 'Open a dispatch by its register number.' },
  { uri: 'web+outpost://station/KRN-07', meaning: 'Open a station by its code.' },
  { uri: 'web+outpost://handbook/loss-of-contact-procedures', meaning: 'Open a handbook chapter by its slug.' },
]

export const handleHref = (uri: string): string => `/handle?${new URLSearchParams({ uri }).toString()}`
