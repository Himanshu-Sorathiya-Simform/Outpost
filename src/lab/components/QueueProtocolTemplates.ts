import { PERIODIC_TAG_DIGEST, SYNC_TAG_OUTBOX, type PageToSw, type SwToPage } from '@shared/sw-protocol'

export interface ProtocolTemplate {
  id: string
  label: string
  /** What a correct page does with this message. */
  expect: string
  /** Deliberately not a valid SwToPage: the bridge must keep it, flag it and do nothing else. */
  invalid?: boolean
  message: SwToPage | Record<string, unknown>
}

const SAMPLE_PUSH = {
  v: 1,
  kind: 'custom',
  title: 'Relay check',
  body: 'Sent by the protocol tester, not by a push service.',
  url: '/log',
  tag: null,
  dispatchId: null,
  badgeCount: null,
  icon: '/icons/icon-192.png',
  image: null,
  actions: [],
  requireInteraction: false,
  silent: false,
  sentAt: '2026-01-01T00:00:00.000Z',
} as const

export const TEMPLATES: readonly ProtocolTemplate[] = [
  {
    id: 'cache-updated',
    label: 'cache-updated',
    expect: 'Invalidates every query whose meta.url matches the URL, so the screen refetches. The note says how many queries it hit.',
    message: { type: 'cache-updated', url: '/api/dispatches', strategy: 'stale-while-revalidate', cacheName: 'api-v1' },
  },
  {
    id: 'sync-complete',
    label: 'sync-complete',
    expect: 'Invalidates the feed and the inbox, re-reads the outbox through sync.listQueued, and shows an "Outbox sent" toast when anything was reported.',
    message: { type: 'sync-complete', tag: SYNC_TAG_OUTBOX, succeeded: ['draft-0001'], failed: [] },
  },
  {
    id: 'periodic-sync-complete',
    label: 'periodic-sync-complete',
    expect: 'Invalidates the digest and the inbox. No toast: a background refresh is not news.',
    message: { type: 'periodic-sync-complete', tag: PERIODIC_TAG_DIGEST, newCount: 3 },
  },
  {
    id: 'navigate',
    label: 'navigate',
    expect: 'Routes this tab to the URL, but only when it is same-origin. Change the URL to https://example.com/ and the note says it was refused.',
    message: { type: 'navigate', url: '/lab/queue?navigated=1' },
  },
  {
    id: 'push-received',
    label: 'push-received',
    expect: 'Invalidates the inbox and shows an in-page toast with an Open action. A payload with silent true gets no toast.',
    message: { type: 'push-received', payload: SAMPLE_PUSH },
  },
  {
    id: 'sw-version',
    label: 'sw-version',
    expect: 'Logged only. It is what the worker answers to get-version, and what it may announce on activate.',
    message: { type: 'sw-version', version: '1.0.0', caches: ['shell-v1', 'api-v1', 'media-v1'] },
  },
  {
    id: 'log',
    label: 'log',
    expect: 'Logged only. Worker debug lines show in the message log of the Worker lab.',
    message: { type: 'log', level: 'info', message: 'activate: claimed 2 clients' },
  },
  {
    id: 'invalid',
    label: 'Invalid: wrong shape',
    expect: 'Rejected by the schema. The bridge keeps the message, marks it invalid with the reason, and does nothing else: no invalidation, no toast.',
    invalid: true,
    message: { type: 'sync-complete', tag: 42, succeeded: 'none' },
  },
]

/** The other direction, for the contract reference: what the page may post to the worker. */
export const PAGE_TO_SW_EXAMPLES: readonly PageToSw[] = [
  { type: 'skip-waiting' },
  { type: 'get-version' },
  { type: 'clear-caches', prefix: 'api-' },
  { type: 'prefetch', urls: ['/handbook', '/api/handbook'] },
  { type: 'ping', nonce: 'a1b2c3' },
]

export const templateJson = (t: ProtocolTemplate): string => JSON.stringify(t.message, null, 2)
