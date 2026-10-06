# Outpost

A field-station dispatch log: React 19 + TypeScript on the front, a small Node server behind it. The content is made up. The point is that it is a normal website with enough real behaviour (stale data, failing writes, auth that expires, versioned deploys, lazy routes) to make every PWA mechanism worth building and easy to observe.

**The rule of the game: you write the PWA layer.** There is no service worker, no manifest and no registration in this repo. Every PWA call the website makes goes through a stub in `src/pwa/` that rejects with `PwaNotImplementedError`, except four that already answer without throwing (`boot`, `notifications.permission`, `periodicSync.isSupported`, `share.canShare`). Until you fill them in, the site runs as an ordinary website and every PWA control says it isn't wired up yet.

The sixteen exercises are in `docs/LEARNING.md`. The reference to keep open while you write the worker (URL map, headers, outbox and push formats, message protocol, chaos presets) is `docs/CONTRACTS.md`.

## Quick start

```bash
npm install
npm run dev     # Vite on :5173 (HMR) + API on :4000, /api and /media proxied
npm run pwa     # build, then the Node server serves dist + API on :4000
```

| command | what it does |
|---|---|
| `npm run dev` | UI work. Service workers do register on localhost here, but module URLs are unhashed, so caching behaviour is not representative. |
| `npm run pwa` | Production build served by the Node server with realistic cache headers and SPA fallback. **Use this for PWA testing.** |
| `npm run release` | Bumps the patch version (`-- minor`, `-- major` also work) and rebuilds. Each build gets a fresh build id, so you can ship "a new deploy" to practise updates against a tab that is already open. |
| `npm test` | Vitest: server contracts (112 tests) and client logic. |
| `npm run typecheck`, `npm run lint` | Strict TypeScript, ESLint. |
| `npm run icons` | Regenerates `public/icons/*.png`. |

Environment: `PORT` (default 4000), `OUTPOST_DATA_DIR` (VAPID keys and push subscriptions, default `server/.data`), `OUTPOST_DIST_DIR`, `VAPID_SUBJECT`, and at build time `APP_VERSION` / `BUILD_ID`. The server also reads `APP_VERSION` (default 1.0.0) for the version it reports.

Server state is in memory and reseeds on restart. The Lab's Server page has a reset. After a reset, seeded ids repeat with `rev 1`, so a client holding a cached ETag from before gets a 304: hard-reload.

## The product

Operators read and file dispatches from remote stations. Each page is a deliberate showcase of one strategy, and tells the truth about how fresh its data is.

| route | what it is | designed to exercise |
|---|---|---|
| `/log`, `/log/:id` | Feed with filters, detail with star / read / acknowledge (optimistic), Share | network-first, optimistic UI vs stale cache, `/media` images cache-first |
| `/file`, `/drafts` | Compose with autosave, idempotent submit; drafts and the outbox | Background Sync, offline writes. `/file` is a shortcut target. |
| `/inbox` | Unread triage, keyboard-driven | badge, push, UI vs badge vs server counts. Shortcut target. |
| `/stations`, `/stations/:code` | Station register | stale-while-revalidate |
| `/signal` | Live board, polls every 5 s | network-only. Flags itself if a response looks cached. Shortcut target. |
| `/handbook`, `/handbook/:slug` | Eight-chapter manual | precache + cache-only |
| `/settings` | Operator (clock in and out), appearance, notifications, install, updates, background refresh, badge, storage | every seam, with its status |
| `/offline` | What a fallback navigation would show | offline navigation |
| `/share-target`, `/handle` | Receives Web Share (GET `?title&text&url`) and `web+outpost://` links | manifest `share_target`, `protocol_handlers` |

## The Lab

`/lab` is the part of the site that makes the machinery visible. It only reads browser state, talks to the backend, or goes through your seams; it implements nothing. The accent turns green so you know you are in the instruments.

| | instrument | |
|---|---|---|
| 1 | Environment | capability matrix, display mode, manifest viewer with an installability checklist, storage quota |
| 2 | Worker | registrations, lifecycle timeline, app-vs-browser state comparison, every page/worker message |
| 3 | Caches | Cache Storage explorer, `caches.match()` tester, old-version flags |
| 4 | Bench | five strategies on five URLs, each judged FRESH / STALE and "server saw it" or not |
| 5 | Consistency | server truth vs React Query vs Cache Storage vs badge |
| 6 | Network | client log joined to server log: network, cache, server-only, failed-before-server |
| 7 | Chaos | fault injection and presets |
| 8 | Server | wire simulator, release simulator, header profiles, session, push console |
| 9 | Queue | which seams are wired, the outbox, open tabs and their builds, a tester for the message protocol |
| 10 | Errors | error centre plus a simulator for every error kind |
| 11 | Query | React Query cache explorer, its settings, persistence |

The Lab home has a 15-item learning path. `docs/LEARNING.md` splits the same work into 16 exercises and maps one list to the other in its last table.

## Where your work goes

| file | seam | called from | watch it in |
|---|---|---|---|
| `src/pwa/boot.ts` | startup, runs after first render | `src/main.tsx` | Lab → Worker |
| `src/pwa/registration.ts` | register, unregister, checkForUpdate, applyUpdate | update toast, Settings, Lab → Worker | Lab → Worker |
| `src/pwa/install.ts` | beforeinstallprompt, prompt | Settings → Install | Lab → Environment |
| `src/pwa/notifications.ts` | permission, push subscribe, local notification | Settings → Notifications | Lab → Server (push console) |
| `src/pwa/sync.ts` | Background Sync outbox | compose offline path, Drafts | Lab → Queue |
| `src/pwa/periodic-sync.ts` | Periodic Background Sync | Settings → Background refresh | Lab → Queue |
| `src/pwa/badge.ts` | app badge | automatic, on unread count change | Lab → Consistency |
| `src/pwa/share.ts` | Web Share | Share button on dispatches and chapters | Lab → Queue |
| `src/pwa/store.ts` | reactive state the UI renders (`swState`, `updateAvailable`, `queuedCount`, ...) | shell, Settings | status strip |

Also yours, and deliberately absent: the service worker file (`public/sw.js` serves from the root scope without a build step; a bundled worker is fine too), `public/manifest.webmanifest`, and the `<link rel="manifest">` hook marked in `index.html`. Icons (192, 512, maskable, apple-touch) are already in `public/icons/`.

Already built for you: the page side of the worker message protocol (`shared/sw-protocol.ts`, `src/lib/bridge`), the Background Sync outbox record shape, a version and deploy watcher, a forced-upgrade gate, and an error taxonomy that classifies a failure into one of 25 kinds. The Lab → Queue protocol tester lets you check the page half before you write the worker half.

Your service worker should leave `/api/_lab/*` alone. Those paths are the instruments; caching them breaks the Lab.

## Troubleshooting

- **A tab keeps running old code.** Hard-reload bypasses the worker. Application → Service workers → Unregister, or Application → Storage → Clear site data, resets everything.
- **Lab says NOT WIRED.** That is the seam call log reporting a stub that has not been implemented yet. It changes to OK as you implement each one.
- **Ports.** API on 4000 (`PORT`), Vite on 5173 (fixed; the proxy follows `PORT`).
- **Chaos left on.** Lab → Chaos → All clear. Chaos lives on the server, not in the browser.
- **No server-side effect for a cached request.** That is the point of Lab → Network: a request the server never saw was answered by a cache.

## Limits

Built and tested in Chrome. Background Sync, Periodic Sync, and parts of Badging and Share Target are Chromium-only or installed-only; the Environment page lists what your browser has, and each seam is expected to degrade rather than throw. Web Push needs the server to reach a push service (FCM for Chrome), so it needs an internet connection.

## Layout

```
shared/    contracts.ts (zod schemas, API paths), sw-protocol.ts (page <-> worker messages)
server/    Express API, fault injection, push, static serving with header profiles
src/pwa/   your stubs
src/lib/   api client, errors, query layer, bridge, net, tabs, version, settings
src/ui/    design system. kitchen.html is a dev-only page showing all of it.
src/features/, src/shell/, src/lab/   product pages, app frame, instruments
docs/      LEARNING.md (the exercises), CONTRACTS.md (reference), ARCHITECTURE.md (spec and conventions), STATUS.md (what exists)
```
