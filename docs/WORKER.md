# The service worker: map of the code

The worker is TypeScript under `src/sw/`. `vite build` bundles it into **one classic script**, `dist/sw.js`, and writes the build id and the list of shell files into it (`scripts/sw-build.ts`). Every build therefore changes the bytes, so every build is a new worker version to the browser. `docs/LEARNING.md` says "edit `public/sw.js`" in many places: read that as "edit the file listed below".

Two ideas this map keeps apart:

- A **strategy** is how a request is answered: cache-only, cache-first, network-first, stale-while-revalidate, network-only.
- A **caching type** is when a cache gets filled: **precache** (once, at install), **runtime** (after a miss or a background refresh), **on-demand** (because the page asked).

A strategy uses a caching type, and every cache belongs to exactly one.

## The files

- `src/sw/index.ts`: the entry. Registers the seven listeners (install, activate, fetch, message, sync, push, notificationclick) and nothing else.
- `src/sw/config.ts`: the cache catalogue (below), the **version of each cache** (`CACHE_VERSIONS`), the allow-list (`CURRENT_CACHES`), the limits and timeouts, the never-cached list.
- `src/sw/routes.ts`: the route table. Which URL is answered by which strategy and which bucket. Add a route here.
- `src/sw/fetch.ts`: the `fetch` listener. GET only, same origin; a navigation goes to `navigation.ts`; everything else is looked up in the route table; no route means the browser handles the request.
- `src/sw/lifecycle.ts`: `install` (precache, then wait) and `activate` (turn on navigation preload, delete the outdated buckets, claim the open pages).
- `src/sw/sync.ts`: the Background Sync event. Tag `outbox-flush` replays the outbox (queued and left-over `sending` records), tells the pages with `sync-complete` (every window and the `outpost-sw` channel), **rejects** while something still waits so the browser retries, and on `lastChance` marks what waits `failed`. The replay itself is not here: it is in `src/outbox/`.
- `src/sw/push.ts`: the `push` event and the notification click. A push is shown as a notification (title, body, icon, tag, at most two actions, `requireInteraction`, and `data` with the url, dispatch id and kind), unless a window is visible **and** focused (then the window gets `push-received` and no system notification) or the payload is **silent**. A silent `sync-poke` replays the outbox (`flush()` from `sync.ts`, its rejection caught); a silent `silent-badge` only tells the windows. Every push that carries a `badgeCount` also sets the app badge first (`src/sw/lib/badge.ts`: a number sets, 0 clears, null leaves it, and it never fails the push). A push with no or unreadable data still shows a plain "Outpost" notification (the `userVisibleOnly` promise). The click closes the notification; `ack` sends `PATCH /api/dispatches/<id> { acked: true }` and tells the windows to refetch (a 401, no id or no network opens the app instead); anything else focuses a window and posts `navigate`, or `openWindow`s the url. The url must be on this site, else `/`. No cache is touched.
- `src/sw/navigation.ts`: page navigations: network first with a 3 s deadline (using the browser's navigation preload), the stored `/index.html` when the network fails, answers 5xx or is too slow. Reads the shell bucket (`shell-v<N>`).
- `src/sw/build-info.ts` and `src/sw/env.d.ts`: the two build-time constants (`__BUILD_ID__`, `__PRECACHE_URLS__`) and how the rest of the worker reads them.
- `src/sw/caching/precache.ts`: the precache type. Downloads and checks the shell, its files and the API data, then writes them, all or nothing.
- `src/sw/caching/runtime.ts`: the runtime type. `lookup()`, `store()` (never-cached guard, size cap) and the `CacheTarget` shape.
- `src/sw/caching/cleanup.ts`: not a caching type; the deleting. `isOurs()` (a name that is exactly `<family>-v<digits>`), `removeOutdated()` (activate) and `clearOurs(prefix?)` (the `clear-caches` message).
- `src/sw/caching/on-demand.ts`: the on-demand type. A **documented placeholder**: the contract's `prefetch` message would drive it; nothing in the worker imports it.
- `src/sw/strategies/cache-only.ts`, `cache-first.ts`, `network-first.ts`, `stale-while-revalidate.ts`, `network-only.ts`: one strategy per file. Each file starts with what it does step by step.
- `src/sw/lib/headers.ts`: the `X-SW-*` header names (checked against `shared/contracts.ts`) and `stamped()` / `stampForStorage()`.
- `src/sw/lib/network.ts`: `tryNetwork()` (one try, the whole body read, classified good / real / bad / failed) and `readJson()`.
- `src/sw/lib/validators.ts`: what a cache-first answer must be before it is stored (`isImage`, `isAsset`, `isBenchEntry`).
- `src/sw/lib/messages.ts`: what the worker tells the pages (`tellPages`) and the three messages it understands (`get-version`, `skip-waiting`, `clear-caches`; push and sync have their own events).
- `src/sw/lib/badge.ts`: `applyBadge()`, the worker's badge writer (the page has its own in `src/pwa/badge.ts`: two writers, one badge, last write wins). It posts a `log` message for each decision, because the OS badge cannot be read.
- `src/sw/lib/scope.ts`: `self` typed as a service worker.

Build and test files live in `scripts/`: `sw-build.ts` (the bundling step, also used by the tests), `sw-shell.ts` (which files are the app shell), `sw-harness.ts` plus one `sw-*.test.ts` per strategy.

## The outbox (not a cache)

Dispatches that could not be sent wait in IndexedDB, in `src/outbox/`, which the page and the worker both import:

- `names.ts`: the database `outpost-outbox`, store `outbox`, tag `outbox-flush`, channel `outpost-sw`, lock `outpost-outbox-flush` (copied from the contract so the worker bundle needs no zod; a test checks they match).
- `store.ts`: `addIfAbsent` (one record per id, never resets one being sent), `list` (oldest first), `save`, `remove`, `markFailed`.
- `replay.ts`: `replayOutbox(statuses)` under the Web Lock; `classify()` is the table of answers (201 or a 200 replay with a JSON body deletes the record; 401, 403, 400, 422 and other 4xx mark it `failed` with the server's message; 429, 5xx, 408, a body that is not JSON keep it `queued`; a rejected fetch or a 429 stops the run).
- `announce.ts`: the `sync-complete` message, posted on the channel.
- The page side is `src/pwa/sync.ts` (`queueDispatch`, `listQueued`, `removeQueued`, `flushNow`); the worker side is `src/sw/sync.ts`. The page's `flushNow` also replays `failed` records; the worker's `sync` does not.

## The caches: what each one stores

Each name is `<family>-v<N>`; `N` comes from `CACHE_VERSIONS` in `config.ts`, shown as `v1` below. Bump a number by hand when that bucket's content must not be read by the new code (a changed stored shape, a fresh start for the shell). It does not change with every build. Install fills the new name next to the old one; `activate` then deletes every bucket of ours that is not on the allow-list.

- **`shell-v1`** (precache). The page itself under `/`, `/index.html` and `/offline` (the same HTML), plus the hashed files the app needs to run offline: the shell (entry script, preloaded chunks, two stylesheets, 11 fonts; 18 files) and every website route chunk with what it needs (`LogPage`, `StationsPage`, `HandbookPage`, `InboxPage`, `SettingsPage` and so on; about 54 files, 234 KB). The Lab's page chunks are not here; they are stored at runtime in `assets-v1`. Written at install. Read by `navigation.ts` when the network fails or is too slow and by the `/assets/` rule of cache-first, before `assets-v1`. No cap; every build renames every file, and an install adds the new build's files without removing the previous build's. They go when the number is bumped or on `clear-caches`.
- **`precache-v1`** (precache). Twelve API answers fetched at install: `/api/handbook`, its eight `/api/handbook/<slug>` chapters, and `/api/bench/cache-only/alpha`, `beta`, `gamma` (`delta` is missing on purpose). Read by cache-only, which never asks the network. Changes only with a new install.
- **`media-v1`** (runtime). Images the page loaded: `/media/dispatch/<id>.svg` plates and `/media/station/<code>.svg` thumbnails. Filled by cache-first on the first request, only a 200 `image/*`. Capped at 30 entries, oldest first.
- **`assets-v1`** (runtime). Hashed files the page loaded that are not in `shell-v1`: the Lab's lazy page chunks and any other script, style, wasm, font or image under `/assets/`. Filled by cache-first. No cap; files of older builds go when the number is bumped or on `clear-caches`.
- **`api-v1`** (runtime). Three families, one entry per exact URL (query string included), capped at 80 entries across all of them, oldest first:
  - network-first: `/api/dispatches` (every filter and cursor), `/api/dispatches/<id>`, `/api/inbox/summary`, `/api/digest`;
  - stale-while-revalidate: `/api/stations`, `/api/stations/<code or id>`, `/api/bench/stale-while-revalidate/<key>`;
  - cache-first: `/api/bench/cache-first/<key>`.

**Never stored, in any bucket:** `/api/signal`, `/api/session`, `/api/ping`, `/api/version`, `/version.json`, `/sw.js`, everything under `/api/push/`, `/api/_lab/` and `/api/bench/network-only/`, every request that is not a GET, and the unhashed `/favicon.svg` and `/icons/*`. The worker enforces the first group itself (`NEVER_CACHED` in `config.ts`: `store()` refuses them whatever asked).

## Cleanup: what gets deleted, and what never does

- **Ours** is a name that is exactly `shell-`, `precache-`, `media-`, `assets-` or `api-` followed by `v` and digits. `api-gateway`, `workbox-precache-v2-...` and `shell-extension-v3` are not ours and are never touched, whatever a message asks for.
- **`activate`** deletes every bucket of ours that is not on the allow-list, before it claims the pages. A bucket that cannot be deleted is logged and the rest still go. The worker log gets one line naming what was deleted.
- **`clear-caches`** deletes every bucket of ours, the current ones included (the next offline visit has nothing until a new install precaches). With a `prefix` only those whose name starts with it. The worker log says what went, or that nothing matched.
- **The release story:** `install` does not call `skipWaiting`, so a new worker installs, waits, and the old one keeps serving the open tabs with their old buckets. The page's `skip-waiting` message (sent to `registration.waiting` by the Update toast) lets it activate; the cleanup then deletes the old buckets and `claim()` switches the tabs, and every tab that was controlled reloads on `controllerchange` (`src/pwa/registration.ts`). A tab left on the old code would lose the old buckets and fail on its next lazy chunk, which is why they all reload. The very first install has nothing to wait for and activates at once. A bucket whose number did not change is shared by both workers while one waits.

## Strategy, caching type, buckets

- **cache-only**: precache type, reads `precache-v1` only. Routes: `/api/handbook`, `/api/handbook/<slug>`, `/api/bench/cache-only/<key>`.
- **cache-first**: runtime type, writes `media-v1`, `assets-v1`, `api-v1`; the assets rule also reads `shell-v1` (precache). Routes: `/media/*`, `/assets/*`, `/api/bench/cache-first/<key>`.
- **network-first**: runtime type, `api-v1`. Routes: `/api/dispatches`, `/api/dispatches/<id>`, `/api/inbox/summary`, `/api/digest`. Falls back to the stored copy after `NETWORK_TIMEOUT_MS` (3 s) or a failure.
- **stale-while-revalidate**: runtime type, `api-v1`. Routes: `/api/stations`, `/api/stations/<code>`, `/api/bench/stale-while-revalidate/<key>`. Posts `cache-updated` when the background refresh finds something different.
- **network-only**: no cache. Route: `/api/bench/network-only/<key>`. Everything else that must never be cached is not routed at all: the worker does not call `respondWith`, so the browser handles it as if there were no worker.
- **navigation** (not one of the five): reads `shell-v1`; network first with a 3 s deadline; `activate` turns on navigation preload.

## Where to change what

- A new URL for an existing strategy: add it to the matching route in `routes.ts` (and, if it must be stored in a bucket with other limits, to the rule next to it).
- A new bucket: declare it in `config.ts` (a version in `CACHE_VERSIONS`, which also makes it a family cleanup knows) with its catalogue comment, add it to `CURRENT_CACHES`, and add it to the list above.
- A new cache version: change one number in `CACHE_VERSIONS`, rebuild, and let the worker update. The old bucket is deleted at activate.
- A new strategy: one file in `strategies/` with the header (what it holds, what it means, caching type, caches touched, steps), then a route.
- Something that must never be cached: add it to `NEVER_CACHED` in `config.ts`.
- The tests run the bundled worker, not the modules one by one: `scripts/sw-harness.ts` builds it and runs it in a sandbox with a fake `caches`, `fetch` and `self`.
