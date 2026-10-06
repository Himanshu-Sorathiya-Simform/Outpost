/**
 * A small in-memory stand-in for the Outpost API, used as `fetch` in tests. It implements just enough of the
 * real server's behaviour (cursor paging, ETag/If-Match, sessions, idempotent create) for the data layer's
 * optimistic logic to be exercised against something that can disagree with it.
 */
import type { Dispatch, DispatchCreate, InboxSummary, Session, Severity } from '@shared/contracts'

export interface RecordedCall {
  method: string
  path: string
  query: URLSearchParams
  headers: Headers
  body: unknown
}

interface Failure {
  method: string
  pathPrefix: string
  response: () => Response
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, 'X-Request-Id': 'req-test', ...headers } })

export const errorResponse = (status: number, code: string, message: string, details?: unknown, headers: Record<string, string> = {}): Response =>
  jsonResponse({ error: { code, message, requestId: 'req-test', details } }, status, headers)

export function makeDispatch(n: number, over: Partial<Dispatch> = {}): Dispatch {
  const id = `dp-${String(n).padStart(6, '0')}`
  return {
    id,
    stationId: 'st-krn07',
    stationCode: 'KRN-07',
    title: `Dispatch ${n}`,
    body: 'Barometer falling.',
    severity: 'routine',
    tags: [],
    filedAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 0) - n * 60_000).toISOString(),
    filedBy: 'VEGA-2',
    coords: null,
    imageUrl: `/media/dispatch/${id}.svg`,
    read: false,
    acked: false,
    starred: false,
    rev: 1,
    clientId: null,
    ...over,
  }
}

export const etagOf = (d: Dispatch): string => `W/"${d.id}-r${d.rev}"`

export class FakeServer {
  /** Newest first. */
  dispatches: Dispatch[]
  feedRev = 1
  /** Who the session cookie belongs to. null = signed out. */
  session: Session | null = FakeServer.sessionFor('VEGA-2', 600)
  readonly calls: RecordedCall[] = []
  private readonly failures: Failure[] = []
  private readonly byKey = new Map<string, Dispatch>()
  private gates: { method: string; release: () => void; open: Promise<void> }[] = []
  private nextNumber: number

  static sessionFor(callsign: string, ttlSec: number): Session {
    const issued = Date.now()
    return {
      operator: { callsign, displayName: callsign },
      issuedAt: new Date(issued).toISOString(),
      expiresAt: new Date(issued + ttlSec * 1000).toISOString(),
    }
  }

  get signedIn(): boolean {
    return this.session !== null
  }

  set signedIn(value: boolean) {
    this.session = value ? FakeServer.sessionFor('VEGA-2', 600) : null
  }

  constructor(dispatches: Dispatch[]) {
    this.dispatches = dispatches
    this.nextNumber = dispatches.length + 1
  }

  /** The next request that matches is answered with `response()` instead of being handled. */
  failNext(method: string, pathPrefix: string, response: () => Response): void {
    this.failures.push({ method, pathPrefix, response })
  }

  /** Holds every request of this method until the returned function is called, so a test can look at the UI in between. */
  hold(method: string): () => void {
    let release = (): void => undefined
    const open = new Promise<void>((resolve) => (release = resolve))
    this.gates.push({ method, release, open })
    return release
  }

  /** Changes a dispatch behind the client's back, the way another tab or operator would. */
  mutateBehindBack(id: string, change: Partial<Dispatch>): Dispatch {
    const current = this.require(id)
    const next = { ...current, ...change, rev: current.rev + 1 }
    this.dispatches = this.dispatches.map((d) => (d.id === id ? next : d))
    this.feedRev += 1
    return next
  }

  callsTo(method: string, path: string): RecordedCall[] {
    return this.calls.filter((c) => c.method === method && c.path === path)
  }

  inbox(): InboxSummary {
    const unread = this.dispatches.filter((d) => !d.read)
    return {
      unread: unread.length,
      urgentUnread: unread.filter((d) => d.severity === 'urgent' || d.severity === 'critical').length,
      total: this.dispatches.length,
      feedRev: this.feedRev,
      asOf: new Date().toISOString(),
    }
  }

  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'http://outpost.test')
    const method = (init?.method ?? 'GET').toUpperCase()
    const headers = new Headers(init?.headers)
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    this.calls.push({ method, path: url.pathname, query: url.searchParams, headers, body })

    const gate = this.gates.find((g) => g.method === method)
    if (gate) await gate.open

    const failureIndex = this.failures.findIndex((f) => f.method === method && url.pathname.startsWith(f.pathPrefix))
    const [failure] = failureIndex >= 0 ? this.failures.splice(failureIndex, 1) : []
    if (failure) return failure.response()

    return this.route(method, url, headers, body)
  }

  private require(id: string): Dispatch {
    const found = this.dispatches.find((d) => d.id === id)
    if (!found) throw new Error(`FakeServer has no dispatch ${id}`)
    return found
  }

  private unauthorized(): Response {
    return errorResponse(401, 'unauthorized', 'Clock in first.')
  }

  private route(method: string, url: URL, headers: Headers, body: unknown): Response {
    const { pathname } = url
    if (pathname === '/api/session') return this.sessionRoute(method, body)
    if (method === 'GET' && pathname === '/api/dispatches') return this.page(url.searchParams)
    if (method === 'POST' && pathname === '/api/dispatches') return this.create(headers, body)
    if (method === 'GET' && pathname === '/api/inbox/summary') return jsonResponse(this.inbox())
    if (method === 'POST' && pathname === '/api/inbox/read-all') {
      const changed = this.dispatches.some((d) => !d.read)
      this.dispatches = this.dispatches.map((d) => (d.read ? d : { ...d, read: true, rev: d.rev + 1 }))
      if (changed) this.feedRev += 1
      return jsonResponse(this.inbox())
    }
    const detail = /^\/api\/dispatches\/([^/]+)$/.exec(pathname)
    if (detail?.[1]) {
      const found = this.dispatches.find((d) => d.id === decodeURIComponent(detail[1] ?? ''))
      if (!found) return errorResponse(404, 'not_found', 'No such dispatch')
      if (method === 'GET') return jsonResponse(found, 200, { ETag: etagOf(found), 'X-Resource-Rev': String(found.rev) })
      if (method === 'PATCH') return this.patch(found, headers, body)
    }
    return errorResponse(404, 'not_found', `FakeServer has no route for ${method} ${pathname}`)
  }

  private sessionRoute(method: string, body: unknown): Response {
    if (method === 'POST') this.session = FakeServer.sessionFor((body as { callsign: string }).callsign, 600)
    if (method === 'DELETE') this.session = null
    return jsonResponse({ session: this.session })
  }

  private page(query: URLSearchParams): Response {
    const severity = query.get('severity') as Severity | null
    const unread = query.get('unread')
    const limit = Number(query.get('limit') ?? 12)
    const matching = this.dispatches.filter((d) => (severity === null || d.severity === severity) && (unread === null || d.read === (unread !== 'true')))
    const start = Number(query.get('cursor') ?? 0)
    const items = matching.slice(start, start + limit)
    const nextCursor = start + limit < matching.length ? String(start + limit) : null
    return jsonResponse({ items, nextCursor, total: matching.length, feedRev: this.feedRev })
  }

  private patch(current: Dispatch, headers: Headers, body: unknown): Response {
    const patch = (body ?? {}) as { read?: boolean; acked?: boolean; starred?: boolean }
    if (patch.acked !== undefined && !this.signedIn) return this.unauthorized()
    const ifMatch = headers.get('If-Match')
    if (ifMatch !== null && ifMatch !== etagOf(current)) {
      return errorResponse(412, 'conflict', `If-Match ${ifMatch} does not match`, { current }, { ETag: etagOf(current) })
    }
    const changed = (Object.keys(patch) as (keyof typeof patch)[]).some((k) => patch[k] !== undefined && patch[k] !== current[k])
    const next: Dispatch = {
      ...current,
      read: patch.read ?? current.read,
      acked: patch.acked ?? current.acked,
      starred: patch.starred ?? current.starred,
      rev: changed ? current.rev + 1 : current.rev,
    }
    this.dispatches = this.dispatches.map((d) => (d.id === current.id ? next : d))
    if (changed) this.feedRev += 1
    return jsonResponse(next, 200, { ETag: etagOf(next), 'X-Resource-Rev': String(next.rev) })
  }

  private create(headers: Headers, body: unknown): Response {
    if (!this.signedIn) return this.unauthorized()
    const input = body as DispatchCreate
    const key = headers.get('Idempotency-Key') ?? input.clientId
    const existing = this.byKey.get(key)
    if (existing) return jsonResponse(existing, 200, { 'Idempotent-Replay': 'true' })
    const created = makeDispatch(this.nextNumber++, {
      title: input.title,
      body: input.body,
      severity: input.severity,
      stationId: input.stationId,
      clientId: key,
      filedAt: new Date().toISOString(),
    })
    this.byKey.set(key, created)
    this.dispatches = [created, ...this.dispatches]
    this.feedRev += 1
    return jsonResponse(created, 201, { ETag: etagOf(created) })
  }
}
