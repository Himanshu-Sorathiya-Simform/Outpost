export type ManifestLevel = 'pass' | 'warn' | 'fail' | 'info'

export interface ManifestCheck {
  id: string
  group: 'Identity' | 'Launch' | 'Icons' | 'Integration' | 'Environment'
  label: string
  level: ManifestLevel
  message: string
}

export interface ProbeResult {
  /** 'skipped' for a cross-origin URL: the page could not read it without CORS, so the verdict would be noise. */
  outcome: 'ok' | 'http-error' | 'network' | 'skipped'
  status: number | null
  contentType: string | null
}

export type ProbeFn = (url: URL) => Promise<ProbeResult>

export interface CheckContext {
  manifestUrl: URL
  pageOrigin: string
  /** Does this pathname land on a real route of this app (not the catch-all)? */
  routeExists(pathname: string): boolean
  probe: ProbeFn
}

export type ManifestLoad =
  | { kind: 'absent' }
  | { kind: 'error'; href: string; reason: 'network' | 'timeout' | 'http' | 'html' | 'parse' | 'shape'; message: string; status: number | null; contentType: string | null }
  | { kind: 'ok'; href: string; status: number; contentType: string | null; cacheControl: string | null; manifest: Record<string, unknown>; loadedAt: number }

const TIMEOUT_MS = 8000

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function findManifestLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel~="manifest" i]')
}

/** Finds <link rel="manifest"> and fetches it without the HTTP cache, the way you would want to see it after an edit. */
export async function loadManifest(): Promise<ManifestLoad> {
  const link = findManifestLink()
  if (!link) return { kind: 'absent' }
  const href = link.href
  const credentials: RequestCredentials = link.crossOrigin === 'use-credentials' ? 'include' : 'same-origin'
  let res: Response
  try {
    res = await fetch(href, { cache: 'no-store', credentials, signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/manifest+json, application/json' } })
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError'
    const crossOrigin = new URL(href).origin !== location.origin
    return {
      kind: 'error',
      href,
      reason: timedOut ? 'timeout' : 'network',
      message: timedOut
        ? `No answer within ${TIMEOUT_MS / 1000} s.`
        : crossOrigin
          ? 'The request failed. The manifest is cross-origin, so a missing CORS header (and a crossorigin attribute on the link) is the usual cause.'
          : navigator.onLine
            ? 'The request failed before any response: the server is unreachable or dropped the connection.'
            : 'The browser is offline and nothing answered from cache. A service worker that precaches the manifest would answer here.',
      status: null,
      contentType: null,
    }
  }
  const contentType = res.headers.get('content-type')
  if (!res.ok) return { kind: 'error', href, reason: 'http', message: `The server answered ${res.status} ${res.statusText}.`, status: res.status, contentType }
  const text = await res.text()
  if (contentType?.includes('text/html')) {
    return { kind: 'error', href, reason: 'html', message: 'The URL returned an HTML page. That is what a single-page app fallback does for a file that does not exist.', status: res.status, contentType }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { kind: 'error', href, reason: 'parse', message: `The body is not JSON: ${err instanceof Error ? err.message : 'parse failed'}.`, status: res.status, contentType }
  }
  if (!isRecord(parsed)) return { kind: 'error', href, reason: 'shape', message: 'The JSON is not an object. A manifest is one object with members such as name and icons.', status: res.status, contentType }
  return { kind: 'ok', href, status: res.status, contentType, cacheControl: res.headers.get('cache-control'), manifest: parsed, loadedAt: Date.now() }
}

/** Is this URL actually there? HEAD first, GET when the server does not do HEAD. Same-origin only. */
export const probeUrl: ProbeFn = async (url) => {
  if (url.origin !== location.origin) return { outcome: 'skipped', status: null, contentType: null }
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const res = await fetch(url, { method, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (res.ok || method === 'GET') {
        void res.body?.cancel()
        return { outcome: res.ok ? 'ok' : 'http-error', status: res.status, contentType: res.headers.get('content-type') }
      }
    } catch {
      if (method === 'GET') return { outcome: 'network', status: null, contentType: null }
    }
  }
  return { outcome: 'network', status: null, contentType: null }
}
