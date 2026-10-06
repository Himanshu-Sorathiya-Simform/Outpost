import type { BenchStrategy } from '@shared/contracts'

export interface StrategyInfo {
  id: BenchStrategy
  name: string
  /** The URL pattern the service worker has to match, e.g. /api/bench/cache-first/:key */
  pattern: string
  /** One paragraph: how it works, when to use it, how it fails. */
  how: string
  when: string
  fails: string
}

export const STRATEGIES: readonly StrategyInfo[] = [
  {
    id: 'cache-first',
    name: 'Cache first',
    pattern: '/api/bench/cache-first/:key',
    how: 'Looks in Cache Storage before anything else. The network is asked only on a miss, and the answer is stored for next time.',
    when: 'Use it for things that never change under the same URL: hashed assets, fonts, media.',
    fails: 'Quietly. A bumped revision on the server is never seen, because nothing ever goes to look.',
  },
  {
    id: 'network-first',
    name: 'Network first',
    pattern: '/api/bench/network-first/:key',
    how: 'Asks the server and keeps a copy of the answer. If the request fails or runs out of time, the stored copy is served instead.',
    when: 'Use it for data that must be right when there is a link and still useful when there is not.',
    fails: 'Slowly. With no timeout, a half-dead connection holds the page until the browser gives up, and only then is the fallback tried.',
  },
  {
    id: 'stale-while-revalidate',
    name: 'Stale while revalidate',
    pattern: '/api/bench/stale-while-revalidate/:key',
    how: 'Answers from the cache at once and sends a request in the background to replace the copy.',
    when: 'Use it for lists where an old answer now beats a correct one in a second.',
    fails: 'By always being one fetch behind. The reading after a bump is the old one; only the reading after that shows the change.',
  },
  {
    id: 'network-only',
    name: 'Network only',
    pattern: '/api/bench/network-only/:key',
    how: 'Never touches Cache Storage. Every request goes to the server and every answer is used once.',
    when: 'Use it where an old answer is a wrong answer: the live signal board, anything that writes.',
    fails: 'Plainly. With no link it fails, and the page has to say so in words.',
  },
  {
    id: 'cache-only',
    name: 'Cache only',
    pattern: '/api/bench/cache-only/:key',
    how: 'Answers from Cache Storage and never from the network. The entries have to be put there at install time.',
    when: 'Use it for what you precached: the app shell, the handbook.',
    fails: 'On anything you did not precache. A miss has nowhere to go, so the worker must answer with an error of its own.',
  },
]

export const STRATEGY_NAME: Record<BenchStrategy, string> = Object.fromEntries(STRATEGIES.map((s) => [s.id, s.name])) as Record<BenchStrategy, string>

/** Key shown as a choice in every card. `delta` is the one nobody precaches. */
export const KEY_NOTE = 'delta is the never-precache key: it exists to make cache-only miss.'
