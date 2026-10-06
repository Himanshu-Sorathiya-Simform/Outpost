import type { Dispatch, InboxSummary, LabTruth } from '@shared/contracts'
import type { AppError } from '@/lib/errors/app-error'

/** Where a fact can be read from. */
export type LayerId = 'server' | 'react' | 'storage' | 'badge'

export const LAYER_LABEL: Record<LayerId, string> = {
  server: 'Server truth',
  react: 'React cache',
  storage: 'Cache Storage',
  badge: 'Badge',
}

/** One layer's answer. A layer that cannot answer says why and never takes the page down with it. */
export type Reading<T> =
  | { status: 'ok'; value: T; /** Epoch ms of the data's own clock when it has one. */ at: number | null }
  | { status: 'empty'; note: string }
  | { status: 'unavailable'; note: string }
  | { status: 'pending' }

// ─── inbox ────────────────────────────────────────────────────────────────────

export interface InboxFacts {
  unread: number | null
  urgent: number | null
  /** feedRev as carried by the inbox summary. */
  inboxRev: number | null
  /** feedRev as carried by the first page of the dispatch feed. */
  feedRev: number | null
}
export type InboxMetric = keyof InboxFacts

export const INBOX_METRICS: ReadonlyArray<{ key: InboxMetric; label: string }> = [
  { key: 'unread', label: 'Unread' },
  { key: 'urgent', label: 'Urgent unread' },
  { key: 'inboxRev', label: 'feedRev in inbox summary' },
  { key: 'feedRev', label: 'feedRev in feed page' },
]

export const emptyInbox: InboxFacts = { unread: null, urgent: null, inboxRev: null, feedRev: null }

export const inboxFacts = (summary: InboxSummary, feedRev: number | null): InboxFacts => ({
  unread: summary.unread,
  urgent: summary.urgentUnread,
  inboxRev: summary.feedRev,
  feedRev,
})

export const serverInboxFacts = (truth: LabTruth): InboxFacts => ({ unread: truth.inbox.unread, urgent: truth.inbox.urgentUnread, inboxRev: truth.inbox.feedRev, feedRev: truth.feedRev })

/** True when both sides know the value and they disagree. A missing value is not a mismatch, only a gap. */
export const differs = (layer: number | null, server: number | null): boolean => layer !== null && server !== null && layer !== server

// ─── dispatches ───────────────────────────────────────────────────────────────

export interface DispatchFacts {
  rev: number
  read: boolean
  acked: boolean
  starred: boolean
}

export const dispatchFacts = (d: Pick<Dispatch, 'rev' | 'read' | 'acked' | 'starred'>): DispatchFacts => ({ rev: d.rev, read: d.read, acked: d.acked, starred: d.starred })

export type Drift = 'match' | 'behind' | 'ahead' | 'flags'

/** How a layer's copy of a dispatch relates to the server's. `flags` = same revision, different read/acked/starred. */
export function driftOf(layer: DispatchFacts, server: DispatchFacts): Drift {
  if (layer.rev < server.rev) return 'behind'
  if (layer.rev > server.rev) return 'ahead'
  return layer.read === server.read && layer.acked === server.acked && layer.starred === server.starred ? 'match' : 'flags'
}

/** `R-S`: read, acked, starred, each as its letter or a dash. */
export const flagString = (f: DispatchFacts): string => `${f.read ? 'R' : '-'}${f.acked ? 'A' : '-'}${f.starred ? 'S' : '-'}`

export const flagWords = (f: DispatchFacts): string =>
  [f.read ? 'read' : 'unread', f.acked ? 'acknowledged' : 'not acknowledged', f.starred ? 'starred' : 'not starred'].join(', ')

// ─── mismatch classes and causes ──────────────────────────────────────────────

export type MismatchClass = 'sw-cache' | 'persisted' | 'optimistic' | 'two-tabs'

export interface ReactDiag {
  error: AppError | null
  /** The refetch is waiting for a connection. */
  paused: boolean
}

export interface BadgeInfo {
  /** Last badge.* call, by outcome. null when the app never called one. */
  outcome: 'ok' | 'not-implemented' | 'error' | null
}

export interface Diagnosis {
  layer: LayerId
  text: string
}

const list = (metrics: InboxMetric[]): string => {
  const names = metrics.map((m) => {
    const label = INBOX_METRICS.find((x) => x.key === m)?.label ?? m
    return label.charAt(0).toLowerCase() + label.slice(1)
  })
  return names.join(', ')
}

const METRIC_KEYS: InboxMetric[] = ['unread', 'urgent', 'inboxRev', 'feedRev']
const REV_KEYS: InboxMetric[] = ['inboxRev', 'feedRev']

interface InboxLayers {
  server: InboxFacts
  react: InboxFacts | null
  storage: InboxFacts | null
  badge: InboxFacts | null
  reactDiag: ReactDiag | null
  badgeInfo: BadgeInfo
}

const differing = (layer: InboxFacts | null, server: InboxFacts): InboxMetric[] => (layer ? METRIC_KEYS.filter((k) => differs(layer[k], server[k])) : [])

/** One line per layer that disagrees, worded after the layer that is most likely to blame. */
export function diagnoseInbox({ server, react, storage, badge, reactDiag, badgeInfo }: InboxLayers): Diagnosis[] {
  const out: Diagnosis[] = []
  const reactDiff = differing(react, server)
  const storageDiff = differing(storage, server)

  if (reactDiff.length > 0 && react) {
    const ahead = reactDiff.some((k) => REV_KEYS.includes(k) && (react[k] ?? 0) > (server[k] ?? 0))
    const sharedWithStorage = storage !== null && reactDiff.every((k) => storage[k] === react[k])
    let text: string
    if (reactDiag?.error) text = `React's last refetch failed (${reactDiag.error.kind}), so it is still showing an older copy.`
    else if (reactDiag?.paused) text = 'React is waiting for a connection before it refetches, so it is showing an older copy.'
    else if (ahead) text = 'React is ahead of the server: the server was reset or restarted, or an optimistic write has not settled.'
    else if (storage !== null && reactDiff.every((k) => storage[k] === server[k])) text = 'Cache Storage is newer than React: the worker revalidated after React read it. React needs a cache-updated message (or another refetch) to catch up.'
    else if (sharedWithStorage) text = 'React and Cache Storage hold the same old copy: the service worker likely answered React\'s last fetch from its cache.'
    else text = 'React cache is behind the server: staleTime not elapsed or refetch failed.'
    out.push({ layer: 'react', text: `${text} (${list(reactDiff)})` })
  }

  if (storageDiff.length > 0 && storage) {
    const ahead = storageDiff.some((k) => REV_KEYS.includes(k) && (storage[k] ?? 0) > (server[k] ?? 0))
    const text = ahead
      ? 'Cache Storage is ahead of the server: the server was reset or restarted after the copy was stored.'
      : 'Cache Storage copy is older than the server: SWR has not revalidated / network-first served fallback.'
    out.push({ layer: 'storage', text: `${text} (${list(storageDiff)})` })
  }

  const reference = react ?? server
  if (badge && differs(badge.unread, reference.unread)) {
    const text =
      badgeInfo.outcome === 'not-implemented'
        ? 'Badge differs from React: badge.set is not wired up yet, so the stub answered and nothing was set.'
        : badgeInfo.outcome === 'error'
          ? 'Badge differs from React: the last badge call failed.'
          : badgeInfo.outcome === null
            ? 'Badge differs from React: the app has not asked for a badge yet.'
            : 'Badge differs from React: badge.set not wired or push handler wrote a different value.'
    out.push({ layer: 'badge', text })
  }
  return out
}

/** Which of the four usual suspects fit a dispatch (or inbox) mismatch. The explanation block marks these. */
export function suspectsFor(react: Drift | null, storage: Drift | null, storageSameAsReact: boolean): MismatchClass[] {
  const out = new Set<MismatchClass>()
  if (react === 'behind') {
    if (storageSameAsReact) out.add('sw-cache')
    out.add('persisted')
    out.add('two-tabs')
  }
  if (react === 'flags') {
    out.add('optimistic')
    out.add('two-tabs')
  }
  if (react === 'ahead') out.add('optimistic')
  if (storage === 'behind' || storage === 'flags') out.add('sw-cache')
  return [...out]
}
