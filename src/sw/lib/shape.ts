// What it holds:  shapeCheckFor(): for the few API answers the worker stores and later serves in place of the network, a plain check that the body
//                 still has the shape the app reads.
// What it means: a 200 with valid JSON can still be the wrong THING. When the server changes what a dispatch looks like (Lab -> Chaos -> Master
//                switches -> Schema drift is that change, live), the status, the content type and the validator header all look healthy, so
//                tryNetwork() calls the answer good. If the worker stored it, the next outage would serve the page a copy it cannot read: the
//                cache poisoned itself. So the answers whose shape the app depends on are checked before they are stored AND again before a stored
//                copy is served, which also repairs a copy that an earlier build stored while it did not check.
// Caching type:  none (this file only judges a parsed body).
// Caches touched: none.
//
// It checks the fields the app relies on, not every field (the page's own schema, shared/contracts.ts, checks all of them): a dispatch has an `id`,
// a `stationId`, a `title`, a `filedAt` and a `severity` that is one of the four. The drifted shape has none of `stationId`, `filedAt` and
// `severity` (it sends `station_id`, `filed_at` and a numeric `level`). The worker carries no schema library, so these are plain checks, the
// same way periodic-sync.ts checks the digest. A shape the app changes on purpose is a change to this file and a bump of CACHE_VERSIONS.api
// in config.ts, together.
//
// Which answers: /api/dispatches (a page of dispatches), /api/dispatches/<id> (one) and /api/digest (its `items` are dispatches). The inbox
// counters and everything the other strategies store are not checked here.

const SEVERITIES: readonly unknown[] = ['routine', 'notice', 'urgent', 'critical']

const isText = (value: unknown): boolean => typeof value === 'string'

/** One dispatch, as far as the app relies on it. */
function isDispatch(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const d = value as Record<string, unknown>
  return isText(d.id) && isText(d.stationId) && isText(d.title) && isText(d.filedAt) && SEVERITIES.includes(d.severity)
}

const items = (body: unknown): unknown[] | null => {
  const found = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).items : undefined
  return Array.isArray(found) ? found : null
}

/** A page of dispatches or a digest: an `items` array in which every entry is a dispatch (an empty one is fine). */
const listOfDispatches = (body: unknown): boolean => items(body)?.every(isDispatch) ?? false

/**
 * The check for this path, or undefined when the worker does not check its answers (the caller then trusts "200, JSON, parses").
 * The check takes the parsed body and says whether it has the shape the app reads.
 */
export function shapeCheckFor(pathname: string): ((body: unknown) => boolean) | undefined {
  if (pathname === '/api/dispatches' || pathname === '/api/digest') return listOfDispatches
  if (/^\/api\/dispatches\/[^/]+$/.test(pathname)) return isDispatch
  return undefined
}
