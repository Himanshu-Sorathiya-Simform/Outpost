import { z } from 'zod'
import { createPersistedStore } from '@/lib/storage'

export interface Exercise {
  no: number
  title: string
  /** What to build, in the register of a field note. */
  note: string
  /** Files to edit. The worker itself is `public/sw.js`, which you create. */
  edit: readonly string[]
  watch: { label: string; to: string }
}

export const EXERCISES: readonly Exercise[] = [
  {
    no: 1,
    title: 'Register the worker and read its lifecycle',
    note: 'Write an empty public/sw.js, register it from boot(), and mirror installing, waiting and active into the PWA store. Reload twice and read the order of events.',
    edit: ['src/pwa/registration.ts', 'src/pwa/boot.ts'],
    watch: { label: 'Lab / Worker', to: '/lab/worker' },
  },
  {
    no: 2,
    title: 'Precache the handbook and serve it cache-only',
    note: 'Fetch the handbook index and all eight chapters at install time, then answer them from the cache and nothing else. Go offline and open chapter 6.',
    edit: ['public/sw.js'],
    watch: { label: 'Lab / Caches', to: '/lab/caches' },
  },
  {
    no: 3,
    title: 'Cache-first for /media images',
    note: 'Contour art never changes for a given id. Look in the cache, fall back to the network, store what comes back. The 40 to 120 ms delay on the server makes the difference visible.',
    edit: ['public/sw.js'],
    watch: { label: 'Lab / Bench', to: '/lab/bench' },
  },
  {
    no: 4,
    title: 'Network-first with a timeout for /api/dispatches',
    note: 'Try the network for three seconds, then fall back to the last copy. Switch on Lie-fi in Chaos and check that the log still opens, marked with its age.',
    edit: ['public/sw.js'],
    watch: { label: 'Lab / Network', to: '/lab/network' },
  },
  {
    no: 5,
    title: 'Stale-while-revalidate for /api/stations and tell React when it changed',
    note: 'Answer from the cache at once, refresh in the background, and post cache-updated so the page invalidates the matching query. Station status drifts every few minutes; wait for it.',
    edit: ['public/sw.js'],
    watch: { label: 'Lab / Consistency', to: '/lab/consistency' },
  },
  {
    no: 6,
    title: 'Keep /api/signal network-only',
    note: 'The one route that must never be replayed. Write the rule for it on purpose, and confirm that offline the Signal page says it has nothing rather than showing old readings.',
    edit: ['public/sw.js'],
    watch: { label: 'Lab / Bench', to: '/lab/bench' },
  },
  {
    no: 7,
    title: 'Offline navigation fallback and /offline',
    note: 'Precache the app shell and answer failed navigations with it, or with /offline when the shell is missing. Then open a route you never visited while offline.',
    edit: ['public/sw.js'],
    watch: { label: 'Lab / Caches', to: '/lab/caches' },
  },
  {
    no: 8,
    title: 'Versioned caches and cleanup on activate',
    note: 'Put the version in every cache name and delete the ones that do not match when the new worker activates. Ship two versions and count the buckets.',
    edit: ['public/sw.js'],
    watch: { label: 'Lab / Caches', to: '/lab/caches' },
  },
  {
    no: 9,
    title: 'The update flow: waiting worker, toast, skipWaiting, old tabs',
    note: 'Detect the waiting worker, set updateAvailable, send skip-waiting when Update is pressed, and reload on controllerchange. Keep a second tab open and watch what it does.',
    edit: ['src/pwa/registration.ts', 'public/sw.js'],
    watch: { label: 'Lab / Worker', to: '/lab/worker' },
  },
  {
    no: 10,
    title: 'Background Sync outbox for new dispatches',
    note: 'When filing fails on the network, store the dispatch in IndexedDB and register a sync. Replay it with its Idempotency-Key, close the tab first, and check the server did not file it twice.',
    edit: ['src/pwa/sync.ts', 'public/sw.js'],
    watch: { label: 'Lab / Queue', to: '/lab/queue' },
  },
  {
    no: 11,
    title: 'Push notifications and the badge',
    note: 'Subscribe with the relay key, show a notification on push, open the dispatch on click, and keep the app badge equal to the unread count even when no window is open.',
    edit: ['src/pwa/notifications.ts', 'src/pwa/badge.ts', 'public/sw.js'],
    watch: { label: 'Lab / Server', to: '/lab/server' },
  },
  {
    no: 12,
    title: 'Periodic sync digest',
    note: 'Register a periodic sync, fetch /api/digest in the handler, update the cache and the badge. The browser picks the interval; trigger it from DevTools instead of waiting.',
    edit: ['src/pwa/periodic-sync.ts', 'public/sw.js'],
    watch: { label: 'Lab / Queue', to: '/lab/queue' },
  },
  {
    no: 13,
    title: 'Web Share, share target and shortcuts',
    note: 'Wire the Share button, add share_target pointing at /share-target, and add shortcuts for File, Inbox and Signal. Share a link to Outpost from another app.',
    edit: ['src/pwa/share.ts', 'public/manifest.webmanifest'],
    watch: { label: 'Lab / Environment', to: '/lab/environment' },
  },
  {
    no: 14,
    title: 'Installability: manifest, icons, install prompt',
    note: 'Write the manifest, link it from index.html, stash beforeinstallprompt before React mounts, and install the app. Read the manifest back in the viewer to see what the browser understood.',
    edit: ['src/pwa/install.ts', 'public/manifest.webmanifest', 'index.html'],
    watch: { label: 'Lab / Environment', to: '/lab/environment' },
  },
  {
    no: 15,
    title: 'Break it on purpose: chaos, schema drift, forced upgrade',
    note: 'Turn on Hard down, Schema drift and a minimum client above this version, one at a time, with your worker running. Decide what each should do and make the app do that.',
    edit: ['public/sw.js', 'src/pwa/registration.ts'],
    watch: { label: 'Lab / Chaos', to: '/lab/chaos' },
  },
]

const PathSchema = z.object({ done: z.array(z.number().int().min(1).max(EXERCISES.length)).catch([]) })

/** Which exercises are ticked. Kept in this browser only (local storage), through the safe helpers. */
export const useLearningPath = createPersistedStore<{ done: number[] }>({
  key: 'outpost.lab.learning-path',
  schema: PathSchema,
  defaults: { done: [] },
})
