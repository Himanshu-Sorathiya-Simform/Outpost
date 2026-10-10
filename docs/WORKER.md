# The service worker: map of the code

The worker is TypeScript under `src/sw/`. `vite build` bundles it into **one classic script**, `dist/sw.js`, and writes the build id and the list of shell files into it (`scripts/sw-build.ts`). Every build therefore changes the bytes, so every build is a new worker version to the browser. `docs/LEARNING.md` says "edit `public/sw.js`" in many places: read that as "edit the file listed below".

Two ideas this map keeps apart:

- A **strategy** is how a request is answered: cache-only, cache-first, network-first, stale-while-revalidate, network-only.
- A **caching type** is when a cache gets filled: **precache** (once, at install), **runtime** (after a miss or a background refresh), **on-demand** (because the page asked).

A strategy uses a caching type, and every cache belongs to exactly one.

## The files

- `src/sw/index.ts`: the entry. Registers the four listeners (install, activate, fetch, message) and nothing else.
- `src/sw/config.ts`: the cache catalogue (below), the limits and timeouts, the never-cached list.
- `src/sw/routes.ts`: the route table. Which URL is answered by which strategy and which bucket. Add a route here.
- `src/sw/fetch.ts`: the `fetch` listener. GET only, same origin; a navigation goes to `navigation.ts`; everything else is looked up in the route table; no route means the browser handles the request.
- `src/sw/lifecycle.ts`: `install` (precache, then skip waiting) and `activate` (claim the open pages).
- `src/sw/navigation.ts`: page navigations: network first with a 3 s deadline (using the browser's navigation preload), the stored `/index.html` when the network fails, answers 5xx or is too slow. Reads `shell-v1`.
- `src/sw/build-info.ts` and `src/sw/env.d.ts`: the two build-time constants (`__BUILD_ID__`, `__PRECACHE_URLS__`) and how the rest of the worker reads them.
- `src/sw/caching/precache.ts`: the precache type. Downloads and checks the shell, its files and the API data, then writes them, all or nothing.
- `src/sw/caching/runtime.ts`: the runtime type. `lookup()`, `store()` (never-cached guard, size cap) and the `CacheTarget` shape.
- `src/sw/caching/on-demand.ts`: the on-demand type. A **documented placeholder**: the contract's `prefetch` message would drive it; nothing in the worker imports it.
- `src/sw/strategies/cache-only.ts`, `cache-first.ts`, `network-first.ts`, `stale-while-revalidate.ts`, `network-only.ts`: one strategy per file. Each file starts with what it does step by step.
- `src/sw/lib/headers.ts`: the `X-SW-*` header names (checked against `shared/contracts.ts`) and `stamped()` / `stampForStorage()`.
- `src/sw/lib/network.ts`: `tryNetwork()` (one try, the whole body read, classified good / real / bad / failed) and `readJson()`.
- `src/sw/lib/validators.ts`: what a cache-first answer must be before it is stored (`isImage`, `isAsset`, `isBenchEntry`).
- `src/sw/lib/messages.ts`: what the worker tells the pages (`tellPages`) and the one message it understands (`get-version`).
- `src/sw/lib/scope.ts`: `self` typed as a service worker.

Build and test files live in `scripts/`: `sw-build.ts` (the bundling step, also used by the tests), `sw-shell.ts` (which files are the app shell), `sw-harness.ts` plus one `sw-*.test.ts` per strategy.

## The caches: what each one stores

- **`shell-v1`** (precache). The page itself under `/`, `/index.html` and `/offline` (the same HTML), plus the hashed files the app needs to run offline: the shell (entry script, preloaded chunks, two stylesheets, 11 fonts; 18 files) and every website route chunk with what it needs (`LogPage`, `StationsPage`, `HandbookPage`, `InboxPage`, `SettingsPage` and so on; about 54 files, 234 KB). The Lab's page chunks are not here; they are stored at runtime in `assets-v1`. Written at install. Read by `navigation.ts` when the network fails or is too slow and by the `/assets/` rule of cache-first, before `assets-v1`. No cap; every build renames every file and old generations stay until exercise 9.
- **`precache-v1`** (precache). Twelve API answers fetched at install: `/api/handbook`, its eight `/api/handbook/<slug>` chapters, and `/api/bench/cache-only/alpha`, `beta`, `gamma` (`delta` is missing on purpose). Read by cache-only, which never asks the network. Changes only with a new install.
- **`media-v1`** (runtime). Images the page loaded: `/media/dispatch/<id>.svg` plates and `/media/station/<code>.svg` thumbnails. Filled by cache-first on the first request, only a 200 `image/*`. Capped at 30 entries, oldest first.
- **`assets-v1`** (runtime). Hashed files the page loaded that are not in `shell-v1`: the Lab's lazy page chunks and any other script, style, wasm, font or image under `/assets/`. Filled by cache-first. No cap; old generations are removed in exercise 9.
- **`api-v1`** (runtime). Three families, one entry per exact URL (query string included), capped at 80 entries across all of them, oldest first:
  - network-first: `/api/dispatches` (every filter and cursor), `/api/dispatches/<id>`, `/api/inbox/summary`, `/api/digest`;
  - stale-while-revalidate: `/api/stations`, `/api/stations/<code or id>`, `/api/bench/stale-while-revalidate/<key>`;
  - cache-first: `/api/bench/cache-first/<key>`.

**Never stored, in any bucket:** `/api/signal`, `/api/session`, `/api/ping`, `/api/version`, `/version.json`, `/sw.js`, everything under `/api/push/`, `/api/_lab/` and `/api/bench/network-only/`, every request that is not a GET, and the unhashed `/favicon.svg` and `/icons/*`. The worker enforces the first group itself (`NEVER_CACHED` in `config.ts`: `store()` refuses them whatever asked).

## Strategy, caching type, buckets

- **cache-only**: precache type, reads `precache-v1` only. Routes: `/api/handbook`, `/api/handbook/<slug>`, `/api/bench/cache-only/<key>`.
- **cache-first**: runtime type, writes `media-v1`, `assets-v1`, `api-v1`; the assets rule also reads `shell-v1` (precache). Routes: `/media/*`, `/assets/*`, `/api/bench/cache-first/<key>`.
- **network-first**: runtime type, `api-v1`. Routes: `/api/dispatches`, `/api/dispatches/<id>`, `/api/inbox/summary`, `/api/digest`. Falls back to the stored copy after `NETWORK_TIMEOUT_MS` (3 s) or a failure.
- **stale-while-revalidate**: runtime type, `api-v1`. Routes: `/api/stations`, `/api/stations/<code>`, `/api/bench/stale-while-revalidate/<key>`. Posts `cache-updated` when the background refresh finds something different.
- **network-only**: no cache. Route: `/api/bench/network-only/<key>`. Everything else that must never be cached is not routed at all: the worker does not call `respondWith`, so the browser handles it as if there were no worker.
- **navigation** (not one of the five): reads `shell-v1`; network first with a 3 s deadline; `activate` turns on navigation preload.

## Where to change what

- A new URL for an existing strategy: add it to the matching route in `routes.ts` (and, if it must be stored in a bucket with other limits, to the rule next to it).
- A new bucket: declare it in `config.ts` with its catalogue comment, and add it to the list above.
- A new strategy: one file in `strategies/` with the header (what it holds, what it means, caching type, caches touched, steps), then a route.
- Something that must never be cached: add it to `NEVER_CACHED` in `config.ts`.
- The tests run the bundled worker, not the modules one by one: `scripts/sw-harness.ts` builds it and runs it in a sandbox with a fake `caches`, `fetch` and `self`.
