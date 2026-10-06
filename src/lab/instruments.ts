import type { IconName } from '@/ui'

/** One of the eleven Lab instruments. The rail, the Lab sub-nav and the Lab home index all read this list. */
export interface Instrument {
  /** Register number, 1-based. */
  no: number
  path: string
  label: string
  icon: IconName
  /** One line: what you can see or do there. */
  purpose: string
}

export const INSTRUMENTS: readonly Instrument[] = [
  { no: 1, path: '/lab/environment', label: 'Environment', icon: 'window', purpose: 'What this browser can do, how the page is displayed, what the manifest says, how much storage is left.' },
  { no: 2, path: '/lab/worker', label: 'Worker', icon: 'worker', purpose: 'Registrations, the lifecycle log, the controller, and every message crossing the page and worker boundary.' },
  { no: 3, path: '/lab/caches', label: 'Caches', icon: 'cache', purpose: 'Every Cache Storage bucket and the entries inside it, read straight from the browser.' },
  { no: 4, path: '/lab/bench', label: 'Bench', icon: 'hourglass', purpose: 'The five caching strategies answering the same request, side by side.' },
  { no: 5, path: '/lab/consistency', label: 'Consistency', icon: 'refresh', purpose: 'Server truth against the React Query cache against Cache Storage. Find the copy that is lying.' },
  { no: 6, path: '/lab/network', label: 'Network', icon: 'network', purpose: 'The client request log joined to the server request log, one row per request.' },
  { no: 7, path: '/lab/chaos', label: 'Chaos', icon: 'bolt', purpose: 'Break the server on purpose: latency, dropped sockets, bad bodies, schema drift.' },
  { no: 8, path: '/lab/server', label: 'Server', icon: 'server', purpose: 'Wire generator, release simulator, header profile, session controls and the push console.' },
  { no: 9, path: '/lab/queue', label: 'Queue', icon: 'queue', purpose: 'Seam call log, the outbox, open tabs and the worker message log.' },
  { no: 10, path: '/lab/errors', label: 'Errors', icon: 'bug', purpose: 'The error centre, plus a simulator that throws every kind of failure the app knows.' },
  { no: 11, path: '/lab/query', label: 'Query', icon: 'query', purpose: 'The React Query cache, entry by entry, and the settings that drive it.' },
]
