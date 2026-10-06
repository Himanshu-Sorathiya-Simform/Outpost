import type { RequestLogEntry } from '@shared/contracts'
import type { NetLogEntry } from '@/lib/api/net-log'

/**
 * Joins the client's request log (what this tab's apiFetch saw) to the server's request log (what the relay
 * saw). The join key is X-Request-Id; failures and header-stripped cache answers carry none, so those fall back
 * to tab id + method + path + time. The class of a row is the answer to "where did that response come from".
 */

export const NET_CLASSES = ['network', 'cache', 'server-only', 'pre-server', 'chaos', 'no-verdict'] as const
export type NetClass = (typeof NET_CLASSES)[number]

export const CLASS_NAME: Record<NetClass, string> = {
  network: 'Network',
  cache: 'Cache',
  'server-only': 'Server only',
  'pre-server': 'Failed before server',
  chaos: 'Chaos',
  'no-verdict': 'No verdict',
}

/** Short text printed on the stamp. The full name is in the tooltip and in every filter. */
export const CLASS_STAMP: Record<NetClass, string> = {
  network: 'Network',
  cache: 'Cache',
  'server-only': 'Server only',
  'pre-server': 'Pre-server fail',
  chaos: 'Chaos',
  'no-verdict': 'No verdict',
}

export const CLASS_MEANING: Record<NetClass, string> = {
  network: 'Client and server both logged it and agree. The request really reached the relay.',
  cache: 'The client got a response and the server never logged that request. Something in between answered: the classic service-worker hit.',
  'server-only': 'The server logged a request this tab never made through apiFetch: a worker revalidating, a prefetch, another tab, a page resource.',
  'pre-server': 'The client failed and the server has no record. The request died on the way out, or the socket never opened.',
  chaos: 'A chaos rule touched it: the server log or the X-Chaos header names the rule.',
  'no-verdict': 'Not enough log to judge. The server log has not caught up yet, or no longer reaches back this far.',
}

export type JoinLink = 'id' | 'heuristic' | 'replay' | 'none'

export interface JoinedRow {
  key: string
  /** Epoch ms used for ordering: client start, or server start for server-only rows. */
  at: number
  cls: NetClass
  link: JoinLink
  client: NetLogEntry | null
  server: RequestLogEntry | null
  /** Link 'replay': the earlier server entry whose X-Request-Id this response carried. */
  replayOf: RequestLogEntry | null
  method: string
  path: string
  /** What the status column leads with: the client's status, else the server's. */
  status: number
  clientStatus: number | null
  serverStatus: number | null
  /** Both sides logged a status and they differ in a way nothing explains. */
  statusDiffers: boolean
  tab: string | null
  ownTab: boolean
  chaos: string | null
  notes: string[]
  /** One sentence: why this row got its class. */
  reason: string
  anomaly: boolean
  failed: boolean
  /** Background traffic the app makes about itself: reachability probe, version checks, lab endpoints. */
  probe: boolean
  /** A server-only row for a static page resource (script, font, image, document): expected, and not what SERVER ONLY is looking for. */
  pageResource: boolean
}

export interface JoinContext {
  /** This tab's X-Tab-Id. */
  tabId: string
  /** Client clock, epoch ms. 0 means "not known yet". */
  now: number
  /** Whether the live feed is delivering server entries right now. */
  feedOpen: boolean
  /** The server log was emptied at this client time (epoch ms), or 0. */
  clearedAt: number
  /** performance.timeOrigin of this page load; server entries older than it cannot have a client twin. 0 disables. */
  pageStart: number
  /** The server ring's capacity: a full ring means older requests may have fallen off. */
  ringSize: number
}

export const HEURISTIC_WINDOW_MS = 3000
/** A matched X-Request-Id whose server entry finished this long before the client even asked is a replayed response. */
export const REPLAY_SLACK_MS = 1000
/** How long a fresh client entry waits for its server twin to arrive over SSE before we call it. */
export const PENDING_GRACE_MS = 2000
const SLOW_PATH_MS = 750

const PAGE_DESTS: ReadonlySet<string> = new Set(['document', 'iframe', 'script', 'style', 'font', 'image', 'manifest', 'worker', 'sharedworker', 'serviceworker', 'audio', 'video', 'track', 'object', 'embed', 'report'])
const PROBE_PATHS = ['/api/ping', '/api/version', '/version.json', '/api/_lab']

export const isProbePath = (path: string): boolean => PROBE_PATHS.some((p) => path === p || path.startsWith(`${p}?`) || path.startsWith(`${p}/`))

export const serverEnd = (s: RequestLogEntry): number => Date.parse(s.ts)
export const serverStart = (s: RequestLogEntry): number => serverEnd(s) - s.durationMs
export const clientEnd = (c: NetLogEntry): number => c.startedAt + c.durationMs

const isFailedClient = (c: NetLogEntry): boolean => c.status === 0 || (c.errorKind !== null && c.status >= 200 && c.status < 300)

interface Link {
  server: RequestLogEntry | null
  replayOf: RequestLogEntry | null
  link: JoinLink
}

function linkByRequestId(asc: readonly NetLogEntry[], byId: ReadonlyMap<string, RequestLogEntry>, claimed: Set<number>): Map<number, Link> {
  const links = new Map<number, Link>()
  for (const c of asc) {
    const s = c.requestId ? byId.get(c.requestId) : undefined
    if (!s) continue
    if (claimed.has(s.seq) || serverEnd(s) < c.startedAt - REPLAY_SLACK_MS) {
      links.set(c.id, { server: null, replayOf: s, link: 'replay' })
    } else {
      claimed.add(s.seq)
      links.set(c.id, { server: s, replayOf: null, link: 'id' })
    }
  }
  return links
}

function linkByHeuristic(asc: readonly NetLogEntry[], server: readonly RequestLogEntry[], tabId: string, claimed: Set<number>, links: Map<number, Link>): void {
  const buckets = new Map<string, RequestLogEntry[]>()
  for (const s of server) {
    if (s.tab !== tabId) continue
    const k = `${s.method} ${s.path}`
    const list = buckets.get(k)
    if (list) list.push(s)
    else buckets.set(k, [s])
  }
  for (const c of asc) {
    if (links.has(c.id) || c.requestId) continue
    const end = clientEnd(c)
    let best: RequestLogEntry | null = null
    let bestGap = Infinity
    for (const s of buckets.get(`${c.method} ${c.url}`) ?? []) {
      if (claimed.has(s.seq)) continue
      const t = serverEnd(s)
      if (t < c.startedAt - HEURISTIC_WINDOW_MS || t > end + HEURISTIC_WINDOW_MS) continue
      const gap = Math.abs(t - end)
      if (gap < bestGap) {
        best = s
        bestGap = gap
      }
    }
    if (best) {
      claimed.add(best.seq)
      links.set(c.id, { server: best, replayOf: null, link: 'heuristic' })
    }
  }
}

interface Verdict {
  cls: NetClass
  reason: string
}

function judgeUnmatched(c: NetLogEntry, replayOf: RequestLogEntry | null, ctx: JoinContext, from: number, until: number): Verdict {
  if (replayOf) {
    return { cls: 'cache', reason: `The response carries X-Request-Id ${replayOf.requestId}, which the server finished ${Math.round((c.startedAt - serverEnd(replayOf)) / 1000)} s before this request began. It is a stored copy of an earlier answer.` }
  }
  if (c.startedAt < from) return { cls: 'no-verdict', reason: 'The server log was cleared or has rolled over since this request, so a missing server entry proves nothing.' }
  if (clientEnd(c) > until) {
    return { cls: 'no-verdict', reason: ctx.feedOpen ? 'Finished a moment ago; the server entry has not arrived over the live feed yet.' : 'The live feed is not open, so newer server entries cannot be seen.' }
  }
  if (c.status === 0) return { cls: 'pre-server', reason: 'The client has no response and the server has no entry for this path from this tab in the time window. It failed before reaching the relay (or the relay is down).' }
  return { cls: 'cache', reason: 'The client received a response and the server has no entry for it, by request id or by tab, path and time. Something other than the relay answered.' }
}

function notesFor(c: NetLogEntry | null, s: RequestLogEntry | null, link: JoinLink, replayOf: RequestLogEntry | null): string[] {
  const notes = [...(s?.notes ?? [])]
  if (link === 'heuristic') notes.push('heuristic join')
  if (replayOf) notes.push('replayed response')
  if (c && s && c.status !== s.status) notes.push(`client ${c.status === 0 ? 'failed' : c.status}, server ${s.status === 0 ? 'no response' : s.status}`)
  if (c && replayOf && c.chaos) notes.push('cached response still carries its X-Chaos label')
  return notes
}

function buildClientRow(c: NetLogEntry, l: Link | undefined, ctx: JoinContext, from: number, until: number): JoinedRow {
  const s = l?.server ?? null
  const link = l?.link ?? 'none'
  const replayOf = l?.replayOf ?? null
  const chaos = c.chaos ?? s?.chaos ?? null
  let verdict: Verdict
  if (s) {
    verdict = chaos
      ? { cls: 'chaos', reason: `Matched to server entry ${s.requestId} (${link === 'id' ? 'by request id' : 'by tab, path and time'}); the chaos rule "${chaos}" touched it.` }
      : { cls: 'network', reason: `Matched to server entry ${s.requestId} ${link === 'id' ? 'by X-Request-Id' : 'by tab, path and time (heuristic)'}. The request reached the relay.` }
  } else {
    verdict = judgeUnmatched(c, replayOf, ctx, from, until)
  }
  const failed = isFailedClient(c)
  const explained = s?.status === 304 && c.status === 200
  const statusDiffers = s !== null && s.status !== c.status && !explained
  const slow = s !== null && c.status > 0 && c.durationMs - s.durationMs > SLOW_PATH_MS
  const notes = notesFor(c, s, link, replayOf)
  if (slow && s) notes.push(`client waited ${Math.round(c.durationMs - s.durationMs)} ms longer than the server took`)
  return {
    key: `c${c.id}`,
    at: c.startedAt,
    cls: verdict.cls,
    link,
    client: c,
    server: s,
    replayOf,
    method: c.method,
    path: c.url,
    status: c.status,
    clientStatus: c.status,
    serverStatus: s?.status ?? null,
    statusDiffers,
    tab: s?.tab ?? ctx.tabId,
    ownTab: s === null || s.tab === ctx.tabId,
    chaos,
    notes,
    reason: verdict.reason,
    anomaly: verdict.cls === 'cache' || verdict.cls === 'chaos' || verdict.cls === 'pre-server' || link === 'heuristic' || statusDiffers || failed || c.status >= 400 || slow,
    failed,
    probe: isProbePath(c.url),
    pageResource: false,
  }
}

/** How long after a CACHE row a same-path request from this tab still looks like the worker revalidating it. */
const REVALIDATE_WINDOW_MS = 2000

/** A request this tab sent for the path of a CACHE row, just after it: a worker that answered from the cache and then asked the relay anyway. */
function followsCacheRow(s: RequestLogEntry, cacheRows: readonly JoinedRow[]): boolean {
  if (s.method !== 'GET') return false
  const start = serverStart(s)
  return cacheRows.some((r) => r.client !== null && r.path === s.path && start >= r.client.startedAt && start <= clientEnd(r.client) + REVALIDATE_WINDOW_MS)
}

function buildServerRow(s: RequestLogEntry, ctx: JoinContext, cacheRows: readonly JoinedRow[]): JoinedRow {
  const ownTab = s.tab !== null && s.tab === ctx.tabId
  const beforeLoad = ctx.pageStart > 0 && serverEnd(s) < ctx.pageStart
  const pageResource = s.dest !== null && PAGE_DESTS.has(s.dest)
  let reason: string
  if (beforeLoad) reason = 'Logged before this page load, so this tab\'s client log cannot hold its twin.'
  else if (s.tab === null) reason = pageResource ? `A page resource (Sec-Fetch-Dest: ${s.dest}). Resource loads are in the RESOURCES tab, not the apiFetch log.` : 'No X-Tab-Id, so it did not come from app code: a service worker revalidating or prefetching, a navigation, or curl.'
  else if (ownTab && followsCacheRow(s, cacheRows)) reason = 'Likely the service worker revalidating: it answered the page from its cache, then called fetch(event.request), which forwards X-Tab-Id, so the request looks like this tab\'s own.'
  else if (ownTab) reason = 'This tab made it (its X-Tab-Id is on it) but the client log has no matching entry: it did not go through apiFetch, or the client ring already dropped it.'
  else reason = 'Another tab made this request; its own client log holds the twin.'
  const chaos = s.chaos
  const probe = isProbePath(s.path)
  return {
    key: `s${s.seq}`,
    at: serverStart(s),
    cls: chaos ? 'chaos' : 'server-only',
    link: 'none',
    client: null,
    server: s,
    replayOf: null,
    method: s.method,
    path: s.path,
    status: s.status,
    clientStatus: null,
    serverStatus: s.status,
    statusDiffers: false,
    tab: s.tab,
    ownTab,
    chaos,
    notes: s.notes,
    reason: chaos ? `${reason} The chaos rule "${chaos}" touched it.` : reason,
    anomaly: chaos !== null || (!beforeLoad && s.tab === null && !pageResource && !probe),
    failed: s.status === 0,
    probe,
    pageResource,
  }
}

/** Which client start times can be judged at all: [from, until]. Outside it, "no server entry" proves nothing. */
export function coverage(server: readonly RequestLogEntry[], ctx: JoinContext): { from: number; until: number } {
  const newest = server[0]
  const oldest = server[server.length - 1]
  const rolled = server.length >= ctx.ringSize && oldest ? serverEnd(oldest) : 0
  const from = Math.max(ctx.clearedAt, rolled)
  const until = ctx.feedOpen ? (ctx.now === 0 ? Infinity : ctx.now - PENDING_GRACE_MS) : newest ? serverEnd(newest) : 0
  return { from, until }
}

/** `server` is newest first (the feed's order); `client` is newest first too. Returns rows newest first. */
export function joinLogs(client: readonly NetLogEntry[], server: readonly RequestLogEntry[], ctx: JoinContext): JoinedRow[] {
  const byId = new Map<string, RequestLogEntry>()
  for (const s of server) byId.set(s.requestId, s)
  const claimed = new Set<number>()
  const asc = [...client].sort((a, b) => a.startedAt - b.startedAt || a.id - b.id)
  const links = linkByRequestId(asc, byId, claimed)
  linkByHeuristic(asc, server, ctx.tabId, claimed, links)

  const { from, until } = coverage(server, ctx)
  const rows: JoinedRow[] = client.map((c) => buildClientRow(c, links.get(c.id), ctx, from, until))
  const cacheRows = rows.filter((r) => r.cls === 'cache')
  for (const s of server) if (!claimed.has(s.seq)) rows.push(buildServerRow(s, ctx, cacheRows))
  return rows.sort((a, b) => b.at - a.at)
}

/** When the next pending row stops being pending, so the caller can re-run the join exactly then. */
export function nextPendingExpiry(rows: readonly JoinedRow[], now: number): number | null {
  let next: number | null = null
  for (const r of rows) {
    if (r.cls !== 'no-verdict' || !r.client) continue
    const t = clientEnd(r.client) + PENDING_GRACE_MS
    if (t > now && (next === null || t < next)) next = t
  }
  return next
}
