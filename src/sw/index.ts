// What it holds:  the entry point of the Outpost service worker: it registers the four listeners and nothing else.
// What it means: this is the file the bundler starts from. Everything the worker does is reached from one of these four events: the
//                browser installing it, the browser activating it, a page making a request, a page sending it a message.
// Caching type:  none (see caching/ for the three types, strategies/ for how requests are answered, routes.ts for who answers what).
// Caches touched: none directly.
//
// Where things are (the full map, with the cache catalogue, is in docs/WORKER.md):
//   config.ts            the caches (what each stores), limits, timeouts, the never-cached list
//   routes.ts            which URL is answered by which strategy
//   caching/             the three caching types: precache.ts, runtime.ts, on-demand.ts (a placeholder)
//   strategies/          cache-only, cache-first, network-first, stale-while-revalidate, network-only
//   navigation.ts        page navigations (the app shell fallback)
//   lifecycle.ts         install and activate
//   lib/                 headers, network checks, validators, messages
//
// The bundler turns this into ONE classic script, dist/sw.js, with the build id and the shell file list written into it (scripts/sw-build.ts),
// so every build changes the bytes and the browser installs a new worker.

import { onFetch } from './fetch'
import { activate, install } from './lifecycle'
import { onMessage } from './lib/messages'
import { scope } from './lib/scope'

scope.addEventListener('install', (event) => {
  event.waitUntil(install())
})

scope.addEventListener('activate', (event) => {
  event.waitUntil(activate())
})

scope.addEventListener('fetch', onFetch)

scope.addEventListener('message', onMessage)
