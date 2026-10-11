// What it holds:  the entry point of the Outpost service worker: it registers the eight listeners and nothing else.
// What it means: this is the file the bundler starts from. Everything the worker does is reached from one of these eight events: the
//                browser installing it, the browser activating it, a page making a request, a page sending it a message, the browser
//                firing a Background Sync event, the browser delivering a push, a person clicking a notification, the browser firing a periodic sync.
// Caching type:  none (see caching/ for the three types, strategies/ for how requests are answered, routes.ts for who answers what).
// Caches touched: none directly.
//
// Where things are (the full map, with the cache catalogue, is in docs/WORKER.md):
//   config.ts            the caches (what each stores, and each one's version), limits, timeouts, the never-cached list
//   routes.ts            which URL is answered by which strategy
//   caching/             the three caching types: precache.ts, runtime.ts, on-demand.ts (a placeholder); and cleanup.ts (deleting old buckets)
//   strategies/          cache-only, cache-first, network-first, stale-while-revalidate, network-only
//   navigation.ts        page navigations (the app shell fallback)
//   lifecycle.ts         install (precache) and activate (preload, delete outdated buckets, claim)
//   sync.ts              the Background Sync event: replays the outbox (the replay itself is in src/outbox/)
//   push.ts              the push event (shows a notification, or handles a silent kind) and the notification click
//   periodic-sync.ts     the periodic sync event: fetches the digest, keeps it, sets the badge, notifies about urgent news
//   lib/                 headers, network checks, validators, messages, the badge writer
//   ../outbox/           the outbox (IndexedDB) and its replay, shared with the page: src/pwa/sync.ts and sync.ts both use it
//
// The bundler turns this into ONE classic script, dist/sw.js, with the build id and the shell file list written into it (scripts/sw-build.ts),
// so every build changes the bytes and the browser installs a new worker.

import { onFetch } from './fetch'
import { activate, install } from './lifecycle'
import { onMessage } from './lib/messages'
import { scope } from './lib/scope'
import { onPeriodicSync, type PeriodicSyncEvent } from './periodic-sync'
import { onNotificationClick, onPush } from './push'
import { onSync, type SyncEvent } from './sync'

scope.addEventListener('install', (event) => {
  event.waitUntil(install())
})

scope.addEventListener('activate', (event) => {
  event.waitUntil(activate())
})

scope.addEventListener('fetch', onFetch)

scope.addEventListener('message', onMessage)

// TypeScript's worker library has no SyncEvent type, so the listener takes a plain Event and sync.ts says what it really is.
scope.addEventListener('sync', (event) => onSync(event as SyncEvent))

scope.addEventListener('push', onPush)

scope.addEventListener('notificationclick', onNotificationClick)

// Like sync, periodicsync has no TypeScript type in the worker library; periodic-sync.ts says what the event really is.
scope.addEventListener('periodicsync', (event) => onPeriodicSync(event as PeriodicSyncEvent))
