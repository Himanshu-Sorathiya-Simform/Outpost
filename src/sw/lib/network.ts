// What it holds:  the worker's way of asking the server and judging the answer: contentType(), readJson() and tryNetwork().
// What it means: `fetch()` resolves on a 404, on a captive portal's sign-in page and on a body that dies half way, so "the fetch
//                worked" proves nothing. These helpers decide whether an answer is the thing that was asked for. Network first,
//                stale while revalidate and the periodic sync's digest fetch (periodic-sync.ts) all build on tryNetwork(). A caller that
//                depends on a body's SHAPE can pass a check (lib/shape.ts), because a 200 with valid JSON can still be the wrong thing.
// Caching type:  none (this file never touches a cache).
// Caches touched: none.

/** The response's content type, lower case, or '' when it has none. */
export const contentType = (response: Response): string => (response.headers.get('content-type') || '').toLowerCase()

/**
 * Parses a body without consuming it (it works on a clone), and refuses empty, garbled or non-object JSON. `name` says what was being
 * read, and starts the error message ("Precache: /api/handbook", "/api/dispatches").
 */
export async function readJson(response: Response, name: string): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await response.clone().json()
  } catch {
    throw new Error(`${name} is not valid JSON`)
  }
  if (typeof body !== 'object' || body === null) throw new Error(`${name} is not a JSON object`)
  return body as Record<string, unknown>
}

/**
 * What one try at the network came to:
 *   good    a 200 with a JSON body that parses
 *   real    an answer that is not a failure of the link and must reach the page as it is: a 401, 403, 404, 304
 *   bad     a real response that is unusable (5xx, 429, HTML, empty or broken body, a body of the wrong shape); `reason` names it
 *   failed  fetch() itself failed (offline, refused, dropped)
 */
export type Attempt =
  | { kind: 'good'; response: Response }
  | { kind: 'real'; response: Response }
  | { kind: 'bad'; reason: string; response: Response }
  | { kind: 'failed'; reason: 'network'; error: unknown }

/**
 * One try at the network, finished off completely: the answer is read to its last byte (from a clone) before it counts as good, so a
 * feed that is cut off half way or dribbled out slowly is caught here and not by the page. `hasShape`, when given, is asked about the parsed
 * body, and a body it refuses is bad with reason 'shape'. It never rejects.
 */
export async function tryNetwork(request: Request, url: URL, hasShape?: (body: unknown) => boolean): Promise<Attempt> {
  let response: Response
  try {
    response = await fetch(request)
  } catch (error) {
    return { kind: 'failed', reason: 'network', error }
  }
  if (response.status >= 500 || response.status === 429) return { kind: 'bad', reason: `status-${response.status}`, response }
  if (response.status !== 200) return { kind: 'real', response }
  if (!contentType(response).includes('application/json')) return { kind: 'bad', reason: 'content-type', response }
  let body: Record<string, unknown>
  try {
    body = await readJson(response, url.pathname)
  } catch {
    return { kind: 'bad', reason: 'body', response }
  }
  if (hasShape && !hasShape(body)) return { kind: 'bad', reason: 'shape', response }
  return { kind: 'good', response }
}
