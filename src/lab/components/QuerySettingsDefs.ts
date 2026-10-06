import type { LabSettingValues } from '@/lib'

interface Base<K extends keyof LabSettingValues> {
  key: K
  label: string
  /** One paragraph: what it does, and how it meets a service worker. */
  explain: string
  /** Takes effect only after a reload. */
  onReload?: boolean
}

export type NumberDef = Base<'staleTimeSec' | 'gcTimeMin' | 'retries' | 'requestTimeoutMs' | 'probeIntervalSec' | 'deployWatchSec'> & { kind: 'number'; min: number; max: number; unit: string }
export type SwitchDef = Base<'refetchOnFocus' | 'persistQueryCache' | 'tabSync' | 'showProvenance'> & { kind: 'switch' }
export type ChoiceDef = Base<'networkMode' | 'rqBuster'> & { kind: 'choice'; options: Array<{ value: string; label: string }> }
export type SettingDef = NumberDef | SwitchDef | ChoiceDef

/** Every lab setting that drives the data layer, with the way each one interacts with a service worker. */
export const SETTING_DEFS: readonly SettingDef[] = [
  {
    kind: 'number',
    key: 'staleTimeSec',
    label: 'Stale time',
    unit: 's',
    min: 0,
    max: 86_400,
    explain:
      'How long fetched data counts as fresh. While fresh, React Query does not refetch on mount or focus. A worker using stale-while-revalidate has its own idea of fresh, so a long stale time on top is double caching: React says fresh, so the request is never made, so the worker never gets to revalidate. At 0, the worker\'s strategy is the only one in play.',
  },
  {
    kind: 'number',
    key: 'gcTimeMin',
    label: 'Keep unused data for',
    unit: 'min',
    min: 0,
    max: 10_080,
    explain:
      'How long an entry stays in memory after the last screen using it unmounts. The persister saves what is in memory, and restores nothing older than 24 hours, so a value below 1440 drops entries from the saved copy before they could be used. Persisting a cache that is collected sooner than it expires is a cache that quietly empties.',
  },
  {
    kind: 'choice',
    key: 'networkMode',
    label: 'Network mode',
    options: [
      { value: 'offlineFirst', label: 'offlineFirst' },
      { value: 'online', label: 'online' },
      { value: 'always', label: 'always' },
    ],
    explain:
      'online, the library default, holds a query back whenever React believes there is no connection, so the request never reaches fetch() and a service worker cannot answer it. offlineFirst fires the first attempt regardless and pauses only the retries, which is what lets cache-first and stale-while-revalidate work offline. always ignores connectivity altogether.',
  },
  {
    kind: 'number',
    key: 'retries',
    label: 'Retries',
    unit: 'times',
    min: 0,
    max: 10,
    explain:
      'Extra attempts for failures that could clear up (offline, network, timeout, rate-limited, unavailable, server, cache-miss, chunk-load, parse), with backoff. Against a network-first worker each retry is another full wait for its timeout, and an outbox queued with Background Sync retries on its own schedule. Two retry loops stacked on one request is how a 429 becomes a ban.',
  },
  {
    kind: 'switch',
    key: 'refetchOnFocus',
    label: 'Refetch stale data on focus',
    explain:
      'When the tab or window regains focus, stale queries refetch. An installed app comes to the front every time you switch to it, so this fires far more often than in a browser tab. Behind a cache-first worker the refetch just reads the same stored copy again; behind stale-while-revalidate it is how the fresh copy reaches the screen.',
  },
  {
    kind: 'switch',
    key: 'persistQueryCache',
    label: 'Persist the query cache',
    onReload: true,
    explain:
      'Saves successful queries to IndexedDB, never the lab or session ones, and restores them on the next load, so a cold start shows data with no network and no worker. That is the data cache a service worker would also be keeping, done by React instead. With both you have two copies that can disagree, which is what Lab, Consistency is for. Hydration runs once before the first render, hence the reload.',
  },
  {
    kind: 'choice',
    key: 'rqBuster',
    label: 'Cache buster',
    onReload: true,
    options: [
      { value: 'version', label: 'version' },
      { value: 'build', label: 'build' },
      { value: 'none', label: 'none' },
    ],
    explain:
      'A string stored beside the persisted cache; if it differs on restore, the whole cache is thrown away. version discards on every release, build on every build, none never. With none, data written by an older schema is restored without a check and comes back in shapes the current zod contracts would reject. It is the same trap as a cache name that never changes.',
  },
  {
    kind: 'number',
    key: 'requestTimeoutMs',
    label: 'Request timeout',
    unit: 'ms',
    min: 0,
    max: 120_000,
    explain:
      'How long apiFetch waits before aborting, 0 meaning never. A network-first worker needs its own timeout shorter than this one: if the page gives up first, the worker\'s cache fallback arrives after nobody is listening. Under lie-fi this number is the whole difference between a slow screen and a blank one.',
  },
  {
    kind: 'switch',
    key: 'tabSync',
    label: 'Sync invalidation across tabs',
    explain:
      'Tells other tabs, over BroadcastChannel, to refetch what this one invalidated. A worker is shared by every tab; a React Query cache is not, so each tab holds its own memory copy. This is how they stay in step. If the worker\'s data cache answers both tabs with the same old response, the refetch they both make changes nothing.',
  },
  {
    kind: 'switch',
    key: 'showProvenance',
    label: 'Show provenance chips',
    explain:
      'Shows where each response came from and how old it is. It reads headers and resource timing and changes nothing about caching. Turn it off to see Outpost as an operator would. A PWA that serves stale data without saying so is the failure the chips exist to make visible.',
  },
  {
    kind: 'number',
    key: 'probeIntervalSec',
    label: 'Reachability probe every',
    unit: 's',
    min: 0,
    max: 3600,
    explain:
      'How often the app sends HEAD /api/ping, because navigator.onLine only knows about the network interface, not the internet. The probe is the lie-fi detector, and it counts a reply only if it carries X-Served-By, so a worker answering the ping from cache cannot fake a live server. 0 stops the interval; events still trigger a probe.',
  },
  {
    kind: 'number',
    key: 'deployWatchSec',
    label: 'Deploy check every',
    unit: 's',
    min: 0,
    max: 3600,
    explain:
      'How often the app asks /api/version and /version.json whether a newer build exists. Both are fetched with no-store, but a worker still sees them; one that caches version.json hides every deploy from every open tab. The service worker\'s own update check is separate and not driven by this. 0 stops the polling; focus and reconnect checks continue.',
  },
]
