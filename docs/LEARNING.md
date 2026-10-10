# Learning path

Sixteen exercises that turn Outpost from an ordinary website into a PWA, in the order that lets each one stand on the last. You write the PWA layer: a service worker, a manifest, and the seams in `src/pwa/*`. The website, the Lab and the server are finished and do not change.

This file is the curriculum. `docs/CONTRACTS.md` is the reference: the URL map, header formats, the sync and push formats and the message protocol. Keep it open while you write the worker. This file points into it instead of repeating it.

**Where the worker lives.** The exercises below say `public/sw.js`. The worker is now TypeScript under `src/sw/`, bundled by `vite build` into one `dist/sw.js` (nothing about registration, scope or updates changes). Read "edit `public/sw.js`" as "edit the matching file in `src/sw/`": `docs/WORKER.md` has the map, and each strategy has its own file in `src/sw/strategies/`.

Do them in order. A few depend on earlier ones: 10 assumes the cache cleanup from 9, 13 and 14 want an installed app (15), and 16 assumes the rest are in place.

Exercises give pointers, contracts, what to expect in the Lab and what usually goes wrong. They do not give worker code. The few fragments of one to four lines show a contract, not a solution.

## How to work

### Two servers, one rule

| command | serves | use it for |
|---|---|---|
| `npm run pwa` | `dist/` plus the API on `:4000`, with production-like cache headers | every exercise |
| `npm run dev` | Vite on `:5173` with HMR, API on `:4000` | UI poking only. Module URLs are not hashed and the header profiles in Lab → Server do not apply to Vite's own files. |

The Node server serves `dist/`, never `public/`. A worker in `public/sw.js` reaches `:4000` only after a build copies it. Leave `npm run pwa` running and rebuild in a second terminal after every edit to the worker, the manifest, `index.html` or anything in `src/`:

```
npx vite build        # a few seconds; skips the type check
npm run build         # type check, then the same build
```

The server reads `dist/` on every request, so it needs no restart. Every build gets a fresh build id even when the code is unchanged. That is deliberate: it is how you ship "a new deploy" to practise updates. `npm run release` bumps the patch version first.

### The loop

1. Change the worker.
2. Rebuild.
3. In the app, Lab → Worker → Actions → **Check for update**, or reload. Hard-reload (Shift) when you want one load with no worker; the page is then uncontrolled until the next normal load.
4. Read three instruments: **Lab → Worker** (what the browser did with the worker), **Lab → Caches** (what you stored), **Lab → Network** (who answered each request).

Chrome DevTools → Application → Service workers has the checkboxes **Update on reload**, **Bypass for network** and **Offline**, plus **Unregister** and **skipWaiting**. Application → Storage → **Clear site data** resets everything, including caches and IndexedDB.

Chaos lives on the server and survives a reload. Lab → Chaos → Presets → **All clear** puts the server back. Lab → Server → Header profile, the release simulator and the session controls also live on the server. Restarting the server resets all of them, and the data reseeds.

### Where the worker lives

Nothing fixes the worker's file name. This file calls it `public/sw.js`, which the server and the Lab both assume:

- Served from the root, it gets scope `/`. The server sends no `Service-Worker-Allowed` header, so a worker under `/assets/` could not control the app.
- The header profiles special-case the exact paths `/sw.js` and `/manifest.webmanifest`. Under Lab → Server → Header profile → **HTTP cache trap** those two get a year of `max-age`. A worker named `/worker.js` stays `no-cache` and the trap never springs.
- `public/` is outside the type check and outside ESLint (`eslint.config.js` ignores it). It is not bundled, so the worker cannot import `shared/*.ts`. Copy the few constants you need: the tags, the database and store names, the channel name. A bundled worker is also fine; setting that up is your call.
- TypeScript's DOM library has `setAppBadge`, `clearAppBadge`, `navigationPreload` and `canShare`, but no `SyncManager`, `registration.sync`, `periodicSync` or `BeforeInstallPromptEvent`. `npm run lint` rejects `any` and `@ts-ignore` in `src/pwa/*`, so declare the small interfaces you need. `src/lab/observers/worker-snapshot.ts` does this for tag listings.

### What the seams tell the page

The website calls `src/pwa/*` only through a wrapper, `callSeam`. Every call lands in Lab → Queue → **Seam call log**, and the **Seam board** shows the latest outcome per method:

| tile | meaning |
|---|---|
| No calls yet | nothing has called it |
| Not wired | the stub answered; you have not written it |
| OK | it ran and resolved |
| Error | it ran and threw something that is not the stub error |

The meter reads **Stubs now answering: N of 20 OK**. Four methods answer before you write anything and are not counted: `boot`, `notifications.permission`, `periodicSync.isSupported`, `share.canShare`.

A tile moves when the website calls the method through `callSeam`. If your own code calls `pwa.registration.register()` from `boot()`, that tile never moves. Press the caller the page already has: Settings buttons, the Lab → Worker action buttons, the update toast, or Lab → Errors → Error simulator → **Call registration.register**. **Probe all seams** calls the six read-only methods once.

How a thrown value becomes a state, which the Settings cards and the Queue board both read:

| you throw or return | the page treats it as |
|---|---|
| `new DOMException('…', 'NotSupportedError')` | kind `unsupported`: "This browser does not offer that." |
| `new DOMException('…', 'NotAllowedError')` or `'SecurityError'` | kind `permission`: shown as blocked or denied |
| `new DOMException('…', 'QuotaExceededError')` | kind `quota` |
| `new DOMException('…', 'AbortError')` | kind `aborted`: recorded in Lab → Errors, never toasted |
| a `TypeError` from calling a missing browser API | `unsupported`, only through `callSeam` |
| anything else | `unknown`, filed in Lab → Errors |

### Provenance: how the page knows who answered

Every response the page reads through `apiFetch` gets a source label, shown in provenance chips and in the Bench ledger:

| label | decided by |
|---|---|
| Network | default |
| SW cache | header `X-SW-Source: cache`, or a cache delivery with a controlling worker |
| SW network | header `X-SW-Source: network` or `revalidated` |
| SW fallback | header `X-SW-Source: fallback` or `cache-miss` |
| HTTP cache | a cache delivery with no controlling worker |

The header is optional but it is the only authoritative signal. `X-SW-Cached-At` (ISO time) becomes the "from N min ago" in the freshness notice; `X-SW-Strategy` and `X-SW-Cache` appear in the chip's popover. Headers on a response from `fetch()` or `cache.match()` are immutable, so stamping means building a new `Response` from the old body, status and headers.

### Lab → Network classes

| class | meaning |
|---|---|
| Network | client and server both logged it |
| Cache | the client got an answer and the server never saw that request |
| Server only | the server saw a request this tab did not make through `apiFetch`: a worker revalidating, another tab, a page resource |
| Failed before server | the client failed and the server has no record |
| Chaos | a chaos rule touched it |
| No verdict | not enough log yet |

The Resources tab lists everything the page loaded, including scripts, chunks, fonts and images. Its "Served from" column says "Cache (HTTP or worker)" and cannot tell the two apart. Combine it with the Server tab: a request the server logged was not answered from either.

### The Lab home checklist

Lab home has a 15-item tick list titled "Learning path". It is a shorter cut of this curriculum with different numbering. The table at the end maps one to the other.

### URLs you will meet

| URL | strategy | exercise |
|---|---|---|
| `/`, `/index.html`, any app route (navigations) | network, then cached shell | 2, 8 |
| `/assets/*` (hashed) | cache-first | 2, 4, 8 |
| `/favicon.svg`, `/icons/*`, `/version.json` (unhashed) | never cache-first | 4, 7 |
| `/media/dispatch/<id>.svg`, `/media/station/<code>.svg` | cache-first | 4 |
| `/api/handbook`, `/api/handbook/<slug>` | precache, cache-only | 3 |
| `/api/dispatches[?…]`, `/api/dispatches/<id>`, `/api/inbox/summary`, `/api/digest` | network-first | 5 |
| `/api/stations`, `/api/stations/<code>` | stale-while-revalidate | 6 |
| `/api/signal`, `/api/session`, `/api/ping`, `/api/version`, `/api/bench/network-only/*`, `/api/push/*`, `/api/_lab/*`, every non-GET | network only | 7 |
| `/api/bench/<strategy>/<key>` | the strategy in the URL | 3 to 7 |
| `POST /api/dispatches` | outbox | 11 |

---

## Exercise 1. Register the worker and read its lifecycle

**Goal.** Register a worker that does nothing yet, and mirror its state into `usePwaStore` so the app and the browser agree.

**Files you edit.** `public/sw.js` (new), `src/pwa/registration.ts`, `src/pwa/boot.ts`. You write to `src/pwa/store.ts` through `setPwa`, you do not edit it.

**Concepts.** `navigator.serviceWorker.register(url, options)`, `ServiceWorkerRegistration.installing`, `.waiting`, `.active`, `ServiceWorker.state`, the `statechange` and `updatefound` events, `navigator.serviceWorker.controller`, `navigator.serviceWorker.ready`, the worker's `install` and `activate` events.

**What the app already does for you.**
- `main.tsx` calls `boot()` once after the first render, through `callSeam('boot', …, { quiet: true })`. An error thrown from it is filed silently in Lab → Errors.
- A Lab observer started before React watches every registration on the origin and records the lifecycle. It re-scans every 2 s, and immediately after any `setPwa` call and after any seam call that starts with `registration`.
- The telemetry strip at the top shows `SW <swState>`, plus an "Uncontrolled" marker when `swState` is anything but `none` and the page has no controller. It reads `SW none` until you write `swState`. Settings → App updates shows Registered, State and Update waiting.
- Module-level code in `src/pwa/*` runs before React mounts, because `main.tsx` imports `@/pwa`.

**Do.**
1. Create `public/sw.js` with an `install` and an `activate` listener that do nothing but exist. Add no fetch handling yet.
2. In `registration.register()`, feature-detect `'serviceWorker' in navigator`, then register `/sw.js`. Keep the returned registration in a module variable; the other methods need it.
3. Call `register()` from `bootPwa()`. Do it from `boot()`, not from a React effect: StrictMode runs effects twice.
4. After it resolves, call `setPwa({ swRegistered: true, swState })`. Attach `statechange` listeners to whichever of `installing`, `waiting` and `active` is set, and write the new state into `swState` on every change. The store field is free text; the comparison table understands "installing", "waiting", "active" and "activated".
5. Rebuild and load `/lab/worker`. Reload once more, then Shift-reload once.

**Observe.**
- Lab → Worker → **Registrations**: scope `http://localhost:4000/`, the three slots, a tag "Controls this page" or "Not controlling this page", and `updateViaCache: imports`. "Controlled by /sw.js" and "serviceWorker.ready resolved" appear in the line above.
- Lab → Worker → **Lifecycle timeline**: rows for `registered`, `statechange` per state, `ready`, `controllerchange`. It is capped at 300 events and lost on reload.
- Lab → Worker → **The store against the browser**: `swRegistered` and `swState` start as Mismatch (the store says `false` and `none`, the browser reports `true` and `active`) and turn to Match when your code writes the store. A line under the verdict names the likely bug.
- First load after registering: the page is not controlled, and "Controls this page" is absent. The next normal load shows it. A Shift-reload drops it again; the registration stays.

**Break it.**
- Put a syntax error in `sw.js`, rebuild, load the page. `register()` rejects and no registration appears. Your `boot()` should not leave `swRegistered` true.
- Make `install` reject on purpose. On a first install the registration is removed again: Registrations reads "Nothing registered for this origin" even though `register()` had already resolved. A store written straight after `register()` is now wrong; the comparison plate will say so.
- Register with a narrower scope, `{ scope: '/lab/' }`. The registration exists with scope `…/lab/`, pages under `/lab/` are controlled and `/log` never is.
- Press Lab → Worker → Actions → **Unregister**. The timeline shows `unregistered`; your store should follow.

**Pitfalls.**
- `register()` resolves when a registration exists, not when the worker is installed or active. Wait for `statechange`, or `navigator.serviceWorker.ready`.
- `ready` stays pending forever on a site with no registration. Do not await it on a path that may not register.
- A fast install can pass through installing, installed and activating before the observer notices. The timeline can legitimately miss rows. Calling `setPwa` right after `register()` triggers a scan; to see every step, make `install` wait a second with `event.waitUntil`.
- A first install is not an update. There is no controller yet; do not raise `updateAvailable` for it (exercise 10).
- `standalone` is already maintained by the store. Do not write it.

**Done when.** Lab → Worker → Registrations shows an active `/sw.js` with "Controls this page" after a normal reload, and the comparison plate has no Mismatch row among `swRegistered` and `swState`. Pressing Error simulator → **Call registration.register** (Lab → Errors) makes the `registration.register` tile on Lab → Queue → Seam board read OK.

---

## Exercise 2. Install, activate, and precache the app shell

**Goal.** Cache the shell at install time, take control without waiting, and be able to say what `skipWaiting` and `clients.claim` each do.

**Files you edit.** `public/sw.js`. Optionally `vite.config.ts` or `package.json` if you want a build-time list of files (see Do 2).

**Concepts.** `ExtendableEvent.waitUntil`, `caches.open`, `Cache.add`, `Cache.addAll`, `self.skipWaiting()`, `self.clients.claim()`, the waiting state, `Request` `cache` modes (`reload`, `no-cache`).

**What the app already does for you.**
- Nothing writes to Cache Storage but you. The app only reads it.
- `/offline` is a route whose component is imported eagerly in the main bundle, so it needs no lazy chunk. Every other screen is a lazy chunk with a hashed name.
- Lab → Caches → **Precheck: is the app kit cached?** looks up `/offline`, `/` and anything under `/assets/` the way a fetch handler would.

**Do.**
1. In `install`, open a cache named with a version (for example `shell-v1`; exercise 9 depends on the suffix) and precache `/` and `/index.html`. Wrap the work in `event.waitUntil`.
2. Decide how the worker learns the hashed file names. `dist/` has no build manifest, and the server refuses any URL with a dot-prefixed segment, so Vite's default `.vite/manifest.json` is not reachable. Options: fetch `/index.html` in `install` and read the `<script>`, `<link rel="modulepreload">` and stylesheet tags; or build with `npx vite build --manifest asset-manifest.json`, which writes `dist/asset-manifest.json` (79 entries at the time of writing, 27 of them dynamic imports); or cache `/assets/*` at runtime (exercise 4). A build step is your call.
3. In `activate`, call `self.clients.claim()` so the first load is controlled. In `install`, call `self.skipWaiting()` for now. Exercise 10 takes it out again.
4. Rebuild. Watch the install, then reload and look at the buckets.
5. In DevTools tick **Offline** and reload `/log`.

**Observe.**
- Lab → Worker → Lifecycle timeline: installed, then activating, then activated, then `controllerchange` (from `claim`).
- Lab → Caches → **Buckets**: your bucket, with `v1` and an entry count. Lab → Caches → Precheck: `/` HIT. The `/assets/*` line says how many entries it found.
- Offline reload: the shell paints. Data screens show their own error or empty states, because their API calls are still not cached. That is correct for this exercise.

**Break it.**
- Add a URL that 404s to the list passed to `addAll`. The whole install rejects and no worker takes over. On a first install the registration disappears again (Registrations: "Nothing registered for this origin"); on an update the old worker keeps running and the new one is discarded. `addAll` is all or nothing.
- Lab → Chaos → Presets → **Hard down** during an install. Same outcome: the install needs the network, and you cannot fix it by retrying from the page.

**Pitfalls.**
- `addAll` and `add` reject on any non-2xx response. A single missing file kills the install.
- `cache.add('/')` goes through the HTTP cache. Under Lab → Server → Header profile → **HTTP cache trap**, `/` is `max-age=31536000` and you would precache a year-old copy. Fetch with `{ cache: 'reload' }` and `put` the result.
- Without `skipWaiting`, a second version waits behind the first until every tab closes. With it, a new worker can take over a page that is running old JavaScript. Both are choices; you will make the choice deliberately in exercise 10.
- `clients.claim()` fires `controllerchange` on pages that had no controller. If you reload on `controllerchange` you reload on the first visit too.

**Done when.** Precheck shows `/` as HIT and `/assets/*` with more than zero entries, and an offline reload of `/log` paints the shell. The timeline shows `activated` and the store comparison still reads Match.

---

## Exercise 3. Cache-only with precache: the handbook and the `delta` miss

**Goal.** Make the handbook work with no link at all by precaching it and answering it from the cache only.

**Files you edit.** `public/sw.js`.

**Concepts.** Precache, `CacheStorage.match`, cache-only strategy, a worker-authored error response, `Cache.addAll` with a list built at install time.

**What the app already does for you.**
- The handbook page and every chapter ask Cache Storage, read-only, whether `/api/handbook/<slug>` is stored, and print "Stored on this device" or "Not stored". The contents plate summarises: "All 8 chapters are stored on this device and will open with no signal", or "No chapter is stored on this device…", or "N of 8…".
- If the chapter list itself is not stored, a chapter page says so and cannot check the rest.
- Lab → Bench → **cache-only** card has a **Precached?** list for `alpha`, `beta`, `gamma`, `delta`, refreshed every 3 s.
- `apiFetch` turns a `504` with `X-SW-Source: cache-miss` into a `cache-miss` error ("Not stored for offline use…"). The Bench shows it as an expected miss, not a fault.

**Do.**
1. In `install`, fetch `/api/handbook`, read the chapter slugs from it and add `/api/handbook` plus each `/api/handbook/<slug>` (eight chapters) to a precache.
2. Also precache `/api/bench/cache-only/alpha`, `beta` and `gamma`. Leave `delta` out on purpose.
3. In `fetch`, for those URLs, answer from `caches.match(request)` and never touch the network.
4. On a miss, answer yourself: status `504`, header `X-SW-Source: cache-miss`, and a JSON error body of the shape in `docs/CONTRACTS.md`. Do not fall through to the network and do not return `Response.error()`.
5. Rebuild, reload so the page is controlled, then open `/handbook` online and offline.

**Observe.**
- `/handbook`: "All 8 chapters are stored on this device", and every chapter row says "Stored on this device". Tick DevTools **Offline** and open chapter 6 (`/handbook/medical-and-welfare`). It opens.
- Lab → Bench → Scenarios → **Never precached** (runs on `delta`): the cache only row shows `cache-miss` with "expected miss", and the report says "5 of 5 as a correct worker would give" once the other four strategies behave too.
- Bench → One key, five strategies → **Run all five** on `alpha`: the cache only row reads Source "SW cache" and Server log "NOT SEEN BY SERVER". On the cache only card, **Server hits** does not move between readings and **Hits +** reads 0 from the second reading on.
- Lab → Caches → Precheck: the three bench keys, `/api/handbook` and all eight chapter URLs show HIT.

**Break it.**
- Lab → Server → Release simulator → **Bump handbook edition**. The relay now serves the next edition, and your cache-only copy keeps the old one. The handbook page header still says the old edition. Nothing in cache-only can fix that; it needs a new worker version and a new install (exercises 9 and 10).
- Bench → Scenarios → **Server down**: cache only should still answer `alpha` from the cache.

**Pitfalls.**
- The key is the URL. The app looks up exactly `/api/handbook/<slug>`. Cache it under a query string, a trailing slash or an absolute URL on another origin and the page says "Not stored". The server sends no `Vary`, so request headers do not affect a match.
- Precaching only the chapters and forgetting `/api/handbook` leaves the page unable to list them.
- `ignoreSearch` hides real misses. Do not use it here.
- A miss that falls through to the network is not cache-only. The Bench counts it: **Hits +** rises and the row reads "SERVER SAW IT".

**Done when.** Bench → Scenarios → Never precached reports `delta` as an expected miss, and the handbook page reads "All 8 chapters are stored on this device" with the network off.

---

## Exercise 4. Cache-first for media and assets, hashed against unhashed

**Goal.** Answer images and hashed assets from the cache, and keep unhashed files out of cache-first.

**Files you edit.** `public/sw.js`.

**Concepts.** Cache-first, runtime caching (`cache.put` after a network miss), response validation before storing, cache size limits, `Cache-Control: immutable`.

**What the app already does for you.**
- Dispatch and station thumbnails are plain `<img>` tags pointing at `/media/dispatch/<id>.svg` and `/media/station/<code>.svg`. The server answers them with `Cache-Control: public, max-age=86400` after an artificial 40 to 120 ms.
- Lab → Network → **Resources** lists every script, font and image the page loads with its transfer size and "Served from".
- Lab → Bench → **cache-first** card pairs the strategy with a route, `/api/bench/cache-first/:key`, whose content you can change on the server.

**Do.**
1. In `fetch`, for `GET /media/*`, look in a media cache, on a miss go to the network, and store the response if it is a 200 whose `Content-Type` starts with `image/`.
2. For `GET /assets/*`, do the same into a separate cache. Hashed names change when the content changes, so cache-first is safe.
3. Apply the same rule to `/api/bench/cache-first/:key`. This route is the one that shows the cost of the strategy.
4. Leave `/favicon.svg`, `/icons/*` and `/version.json` alone. They have no hash in the name.
5. Put a cap on the media cache: after each `put`, trim it to a fixed number of entries, oldest first.
6. To observe it, switch Lab → Server → Header profile to **No store**, then reload `/log` twice.

**Observe.**
- With the profile on **No store** the browser's HTTP cache is out of the picture, so every request the server sees is one your worker did not answer. Under **Realistic**, `/media/*` has `max-age=86400` and hashed files are `immutable`, so the browser answers them without you and the server log tells you nothing about the worker.
- Lab → Network → Server: after the first load, a second load of `/log` produces no `/media/` rows. Lab → Network → Resources shows the same images with "Cache (HTTP or worker)".
- Lab → Bench → cache-first card: fetch `alpha` twice. Second reading: Source "SW cache", **Server hits** unchanged, **Hits +** 0. Press **Bump on server**, fetch again: the verdict reads "STALE by 1 rev" and Hits + stays 0. That is the price of never asking.
- Lab → Bench → Scenarios → **Stale after bump**: the cache first row is expected to be stale.

**Break it.**
- Lab → Chaos → Rules → **Add rule**: path prefix `/media/`, mode `status` 500 (or `html-200`), then **Apply** and enable it. Load a dispatch you have not seen. If your worker stores whatever came back, the broken image is now the cached answer, and it stays broken after you turn the rule off.
- Lab → Chaos → Presets → **Stale chunks** (every `/assets/*` answers 404). A worker that stores the 404 will keep serving it.

**Pitfalls.**
- Check `res.ok` and the content type before `cache.put`. `fetch` resolves on a 404 and on a captive-portal page.
- `cache.put` consumes the body. Put a `clone()`, answer with the original, and keep the write inside `event.waitUntil`.
- Cache-first with no limit grows without bound. Each SVG is a few kilobytes, but new dispatches keep arriving.
- An unhashed URL under cache-first never updates. Run `npm run icons`, rebuild, and your worker will keep serving the old PNGs. `/version.json` under cache-first hides every deploy from the deploy watcher in every tab.
- Hashed does not mean forever in your own cache: exercise 9 removes old generations.

**Done when.** On the Bench cache first card the second reading shows "SW cache" with Hits + 0 and, after a bump, "STALE by 1 rev". On Lab → Network → Server a second load of `/log` under the No store profile shows no `/media/` requests.

---

## Exercise 5. Network-first with a timeout and a fallback: dispatches

**Goal.** Serve the log from the network when the link is good, and from the last copy when it is not, without waiting for the browser to give up first.

**Files you edit.** `public/sw.js`.

**Concepts.** Network-first, `AbortSignal.timeout()` or `Promise.race`, falling back to `caches.match`, `Response.ok`, content-type checks, `event.waitUntil` for the write.

**What the app already does for you.**
- `apiFetch` has its own request timeout: Lab → Query → Settings → **Request timeout**, 10 000 ms by default. Your worker's timeout must be shorter, or the page gives up before your fallback arrives.
- The log and dispatch pages print a freshness notice when what is on screen is not fresh: "Stored copy" (with "The service worker answered from its cache." for `X-SW-Source: cache`, or "The service worker made up this answer because the relay did not give one." for `fallback`; both need your stamp), "Could not refresh", "Waiting for a signal", "Restored from this device".
- Lab → Chaos → **Probe** fires a chosen request through `apiFetch` one, five or twenty times and records each result in **Results**.

**Do.**
1. For `GET /api/dispatches`, `GET /api/dispatches/<id>`, `GET /api/inbox/summary` and `GET /api/digest`, try the network with a timeout (about 3 s).
2. If the response is a 200 with `Content-Type` JSON, store a clone and answer with it.
3. If the network fails, times out, or answers anything else, answer from `caches.match(request)`. If nothing is stored, let the network failure through.
4. Stamp what you return: `X-SW-Source` (`network`, or `fallback` for the stored copy) and `X-SW-Cached-At` when you write the cache entry.
5. Warm the cache by opening the log and a dispatch while online.
6. Lab → Chaos → Presets → **Lie-fi**. Reload `/log`.

**Observe.**
- Lie-fi delays every `/api` request by 4 to 9 s. With a 3 s worker timeout the log should open in about 3 s with a "Stored copy" notice instead of waiting 4 to 9 s. The telemetry strip reads "Lie-fi" because its 3 s reachability probe gives up.
- Lab → Chaos → **Probe**: target "Dispatch list", **Give up after** 15 s, **Fire** 5 times. **Results** should show five fast answers rather than five waits.
- Lab → Bench → Scenarios → **Server down**: the network first row is expected to be the warm copy, with Source "SW fallback".
- Lab → Bench → Scenarios → **Stale after bump**: the network first row is expected to be FRESH.

**Break it.** Each of these is a preset under Lab → Chaos → Presets.
- **Flaky API**: 30% of `/api` requests answer 500. A worker that stores or serves a 500 as success is wrong; it should fall back to the last good copy.
- **Captive portal**: 200 with an HTML page. Check the content type before you store it.
- **Corrupt JSON** and **Empty 200**: 200 JSON that does not parse, and 200 with no body.
- **Truncated feed**: `GET /api/dispatches` sends 200 and the first bytes, then the socket dies. The failure arrives while the body is read, not while connecting.
- **Slow body**: headers at once, the body in about forty chunks over six seconds.
- **Hard down**: the socket of every non-lab request is destroyed.

**Pitfalls.**
- `fetch` does not reject on an HTTP error. Test `res.ok`.
- The cache key includes the query string. The log is requested with many filter combinations and cursors. A fallback by exact URL answers only what you saw before. Do not reach for `ignoreSearch`: it would answer `?severity=urgent` with the unfiltered list. Lab → Caches → **match() tester** shows it: with `/api/dispatches?limit=12` stored, match `/api/dispatches?limit=12&severity=urgent`. It misses; tick **ignoreSearch** and it hits, returning the unfiltered page.
- A timeout that aborts the request also abandons the cache refresh. Decide whether to let the network request finish in the background and store its result.
- After a timeout the page gets the stored copy while the server may still be working on the abandoned request. Lab → Network can show that as a late "Server only" row.
- Retries multiply. Lab → Query → Settings → **Retries** (2 by default) times your timeout is how long a failing screen spins.
- Lab → Query → Settings → **Network mode**: `offlineFirst` (the default) lets the first attempt out even when the browser thinks it is offline; `online` holds the request back so your worker is never asked.

**Done when.** With **Lie-fi** on and the cache warm, the log opens in about the worker's timeout, not 4 to 9 s, and shows the "Stored copy" notice. On Lab → Bench the **Server down** and **Stale after bump** scenarios both read "As expected" for the network first row.

---

## Exercise 6. Stale-while-revalidate for stations, and the `cache-updated` message

**Goal.** Answer from the cache immediately, refresh in the background, and tell the page when the stored copy changed.

**Files you edit.** `public/sw.js`.

**Concepts.** Stale-while-revalidate, `event.waitUntil` around the background fetch, `ETag` comparison, `Clients.matchAll`, `Client.postMessage`, `BroadcastChannel`.

**What the app already does for you.**
- The page validates and logs every worker message. `{ type: 'cache-updated', url }` invalidates every query whose `meta.url` equals the path, or sits beneath it on a path-segment boundary. `/api/stations` therefore also refreshes `/api/stations/<code>`; `/api/dispatches` covers `/api/dispatches/<id>`.
- Messages may come over `navigator.serviceWorker` or over a `BroadcastChannel` named `outpost-sw`. Both reach the same handler.
- The server changes one station every 2 to 4 minutes (a new `status` or `lastContactAt`, `rev` plus one) and sends an `ETag`.

**Do.**
1. For `GET /api/stations` and `GET /api/stations/<code>`, answer from the cache if there is a copy and start a background fetch with `event.waitUntil`.
2. When the background fetch returns a 200 JSON response, compare its `ETag` with the stored copy's. If they differ, store it and post `cache-updated` with `url` set to the request's path, plus `strategy` and `cacheName` if you like.
3. If there is no copy, wait for the network and store the result.
4. Post to windows with `clients.matchAll({ type: 'window' })`, or to the `outpost-sw` channel.
5. Use the Bench to iterate quickly: the SWR bench route changes on demand, stations only every few minutes. Apply the same logic to `/api/bench/stale-while-revalidate/:key`.

**Observe.**
- Lab → Bench → stale while revalidate card: **Bump on server**, then **Fetch**. The reading is STALE by 1 rev, from the cache. Fetch again: FRESH. That is "always one fetch behind".
- Lab → Worker → **Message log**: an `in` row of type `cache-updated`, schema valid, and a note such as "invalidated 1 query". Filter with the **Valid** segment.
- Lab → Consistency → Levers → **Change behind React's back** moves the server and neither the React cache nor Cache Storage; **Heal** refetches React only. The Cache Storage column follows your worker. The Inbox table shows which layer is behind and a probable cause per layer.
- The Stations page: a chip with "SW cache", then the list changes with no reload after the message.

**Break it.**
- **Hard down** while a revalidation runs. The background fetch rejects; it must not turn into an unhandled rejection or erase the stored copy.
- **Captive portal** and **Corrupt JSON**: do not overwrite a good copy with HTML.
- **Flaky API**: a 500 on revalidation must be ignored.
- Lab → Query → Settings → **Stale time** to 3600, then leave Stations and return. React Query calls the data fresh and never asks, so your worker never revalidates. Two caches, one believed.

**Pitfalls.**
- Do not post `cache-updated` when nothing changed. The page refetches on the message, the refetch hits your worker, which revalidates and posts again: a loop. Compare `ETag`, or the body, first.
- The browser may send conditional requests itself; a `fetch()` returns 200 even when the server said 304. Do not use the status to decide whether the data changed.
- Without `event.waitUntil` the worker can be stopped before the background write finishes.
- `fetch(event.request)` forwards headers including `X-Tab-Id`. `fetch(url)` does not. Lab → Network shows the difference: a revalidation with the tab id is attributed to your tab as a "Server only" row; without it the row has no tab.
- Keep `ETag` when you rebuild a response to stamp headers; you need it for the next comparison.

**Done when.** After one bump and two fetches the Bench row for stale while revalidate matches its expectation ("As expected" under Scenarios → Stale after bump), and a `cache-updated` message with a non-zero invalidation count appears in Lab → Worker → Message log.

---

## Exercise 7. Network-only, done properly

**Goal.** Keep live and authenticated routes away from every cache, and know why declining to handle a request differs from `respondWith(fetch(event.request))`.

**Files you edit.** `public/sw.js`.

**Concepts.** The `fetch` event, `event.respondWith`, passing a request through, `Request.cache`, `Request.method`, `Response` header immutability.

**What the app already does for you.**
- The Signal page polls `/api/signal` every 5 s and labels itself. It raises "Possibly cached: this endpoint should never be" when the sequence number repeats or falls, when a sample is more than 15 s old on arrival, or when the source is `sw-cache`, `http-cache` or `sw-fallback`. The evidence rows are "Sequence", "Age on arrival" and "Source".
- With the link down it shows "Last known: no link" and the readings are headed "Readings (last known)".
- The reachability probe (`HEAD /api/ping`) counts a reply as the relay only if it carries `X-Served-By`, so a stored 204 cannot pass for a live server.
- The deploy watcher fetches `/api/version` and `/version.json` with `cache: 'no-store'`.
- Writes carry `Idempotency-Key`. The Lab depends on `/api/_lab/*`: caching or rewriting those breaks the instruments.

**Do.**
1. List what must never be cached: `/api/signal`, `/api/session`, `/api/ping`, `/api/version`, `/version.json`, `/api/bench/network-only/*`, `/api/push/*`, everything under `/api/_lab/`, and every request whose method is not `GET`.
2. Decide per route whether to leave the request alone (return from the `fetch` handler without calling `respondWith`) or to call `respondWith(fetch(event.request))`.
3. For `/api/bench/network-only/*`, take the second form and stamp `X-SW-Source: network` on the result.
4. For the rest, leave them alone, and check in the Network lab that nothing changed.

**Observe.**
- Lab → Bench → network only card: Source "Network" (or "SW network" if you stamped it), and from the second reading on **Hits +** is 1 on every fetch. It is never 0.
- Lab → Bench → Scenarios → **Server down**: the network only row is expected to fail with a network error, shown to the operator.
- Lab → Network → Server: one `GET /api/signal` row per poll, about every 5 s. If some polls are missing there, something answered them.

**Break it.**
- Put `/api/signal` under cache-first once, on purpose. The Signal page shows "Possibly cached" with the three evidence rows, and "(suspect)" on the ones that tripped. Take it out again.
- Lab → Chaos → Presets → **Signal board hangs**: `/api/signal` never answers. The page times out on its own clock (Request timeout). Your worker must not replace the timeout with a stored board.
- **Hard down**: Signal reads "Last known: no link" and the readings are marked last known. Nothing from your worker should make them look live.
- **Dropped writes**: half of POSTs lose their socket. A write your worker passed through must fail as the page sees it, not be retried silently.

**The difference that matters.**

| | not handled | `respondWith(fetch(event.request))` |
|---|---|---|
| who makes the request | the browser, as the page asked | your worker, as a second fetch |
| worker involvement | the `fetch` event still fires, so the worker still has to start; the handler returns and the browser carries on | the same, plus the worker holds the request open until its own fetch settles |
| source label | "Network" | "Network", or "SW network" if you stamp `X-SW-Source: network` |
| failure | a network error | a network error, or whatever response you build |
| header stamping | impossible | possible, by building a new `Response` |

Both go through the HTTP cache by default. `fetch(event.request)` keeps the original `cache` mode, so `no-store` survives; `fetch(event.request.url)` does not. Passing the `Request` object also forwards its headers, including `X-Tab-Id`; building a fresh request from a URL drops them, and the Network lab then shows rows with no tab.

**Pitfalls.**
- Adding a worker-side timeout to a network-only route that returns a stored copy is cache-first by another name.
- Calling `respondWith` asynchronously, after an `await`, is too late. The decision must be synchronous.
- Handling `POST` through `cache.match` or `cache.put` does nothing useful: `cache.put` rejects non-GET requests.
- If the worker answers a write with 202 or 200 from a queue, the page will think it was filed. Queue failed writes through the seam (exercise 11), not in the `fetch` handler.
- A `respondWith` that rejects shows as a network failure in the page. A 500 you invent shows as `server`.

**Done when.** The Signal page never shows "Possibly cached", Bench → network only reads 1 on **Hits +** and fails under **Server down**, and Lab → Network → Server shows a request for every poll.

---

## Exercise 8. Offline navigation: the shell, `/offline`, lazy chunks and stale chunks

**Goal.** Make an offline navigation to any app route paint something, and make a release not strand an open tab.

**Files you edit.** `public/sw.js`.

**Concepts.** `Request.mode === 'navigate'`, SPA app-shell fallback, `Response.redirect`, Navigation Preload (`registration.navigationPreload`, `FetchEvent.preloadResponse`), hashed chunk names, dynamic `import()` failures.

**What the app already does for you.**
- The server answers a navigation with `index.html` only when the request says `Accept: text/html`. `/` and `/index.html` work with any `Accept`. Verified: `curl localhost:4000/offline` returns `404 text/plain`; with `-H 'Accept: text/html'` it returns the shell. A worker that calls `cache.add('/offline')` sends `Accept: */*`, gets that 404, and the install fails.
- Every navigation returns identical HTML. The router reads `location`, so if you answer a navigation to `/stations` with a cached `/offline` response, the page still renders Stations. To land on the offline screen, answer with a redirect to `/offline`.
- The `/offline` route is not lazy. The page shows link status, what works without a link, and what an offline Outpost would do.
- A missing hashed file answers `404 text/plain`, never the SPA fallback, so a stale chunk fails for real. The app turns a failed dynamic import into a `chunk-load` error, a "Loading failed" banner ("A screen failed to load. A newer version may have replaced it.") with a Reload button, and an error screen.
- Lab → Errors has Error simulator → **Import a missing chunk**, and Full-page failures → **Route chunk**, which fail exactly as a deleted chunk does.

**Do.**
1. In `fetch`, for `request.mode === 'navigate'`, try the network (consider a timeout) and on failure answer the cached shell. Any app route can be answered with the same shell.
2. Precache the route chunks, not only the shell (exercise 2, Do 2). An uncached chunk is the usual offline failure.
3. Precache `/offline` with `{ headers: { Accept: 'text/html' } }` as well, then choose what a failed navigation gets: the cached shell (the URL stays and each screen shows its own state), or a redirect to `/offline` (the URL changes and the page shows link status). Try both; the bytes are identical, only the URL differs.
4. Try Navigation Preload: `self.registration.navigationPreload.enable()` in `activate` and read `event.preloadResponse` in the navigation branch.
5. Ship a release: `npm run release` (or `npx vite build`). Hold an old tab open across the build.

**Observe.**
- DevTools **Offline**, then open a route you have never visited. If the chunk is precached, it paints. If not, you see the "Loading failed" banner and a `chunk-load` row in Lab → Errors.
- Lab → Caches → Precheck: `/offline` HIT and `/` HIT.
- Lab → Worker → Registrations → **Navigation preload**: "on, header "true"" once enabled.
- After a build, in the old tab, open a route it has not loaded yet. Lab → Network → Server shows `GET /assets/<old chunk>` with status 404, and Lab → Errors files `chunk-load`. Lab → Errors → **Full-page failures** → **Route chunk** reproduces the same failure on demand and raises the same banner.

**Break it.**
- Lab → Chaos → Presets → **Stale chunks**: every `/assets/*` answers 404 (as JSON, even there). Switch Lab → Server → Header profile to **No store** first; under **Realistic** the browser answers hashed files from its own cache and the preset never bites. Routes whose chunks you precached still load. Anything not in your cache fails. A worker that stored the 404 earlier will serve it forever.
- **Hard down**: navigations fail too, because the server destroys every non-lab socket. This is "online but unreachable", which DevTools **Offline** does not reproduce. The strip reads "Lie-fi" and the browser still reports online.
- Under Lab → Server → Header profile → **HTTP cache trap**, `index.html` has a year of `max-age`. Deploy a build and navigate: both a plain page and a worker that calls `fetch(event.request)` get the old `index.html` from the HTTP cache. Fetch the shell with `cache: 'no-cache'` (or `'reload'`) and the new one arrives.

**Pitfalls.**
- Enabling Navigation Preload and never using `preloadResponse` makes the browser fetch every navigation twice. Await it, or pass it to `event.waitUntil`.
- The deployed `index.html` names the new entry file. A cached old `index.html` plus a cache that has dropped the old chunks produces `chunk-load` on every route. Keep the previous build's chunks until old clients have gone, or reload them.
- Do not answer an `/api/*` request with the shell. The page reads a 200 `text/html` body as `parse`, and a `{}` body as `schema-mismatch`.
- Dev mode (`:5173`) has no hashed names. Use `npm run pwa`.

**Done when.** With DevTools **Offline** on, a reload of `/stations`, a route you precached but never visited, paints. With **Stale chunks** on, precached routes still load; routes you did not cache show the "Loading failed" banner rather than a blank page.

---

## Exercise 9. Versioned caches and cleanup on activate

**Goal.** Put a version in every cache name and delete the old generations when a new worker activates.

**Files you edit.** `public/sw.js`.

**Concepts.** `caches.keys()`, `caches.delete()`, an allow-list in `activate`, `waitUntil`, the cache-name convention `prefix-v<number>`.

**What the app already does for you.**
- Lab → Caches groups buckets by prefix. It recognises a trailing `-v3` or `-3`, or an infix `-v3-` (as Workbox writes). Within a group the newest version is "newest vN", and older buckets carry **superseded** with the line "older than vN — your activate handler should delete this".
- Lab → Bench → **Versioned caches** lists families and tags each member "current vN", "old vN" or "unversioned", with "N versions side by side. Activate should have removed the older ones."
- Lab → Worker → Actions → **Send clear-caches** posts `{ type: 'clear-caches' }` to the controller, after a confirmation. The contract also allows a `prefix`.

**Do.**
1. Name every cache with a version constant: `shell-v1`, `api-v1`, `media-v1`, `precache-v1`. Decide whether the number changes on every build or only when a stored shape changes.
2. In `activate`, list `caches.keys()` and delete every name that starts with your prefix and is not on the current allow-list. Wrap it in `event.waitUntil`.
3. Handle the `clear-caches` message: delete caches whose names start with the given prefix, or all of yours if none is given.
4. Bump the constant to `v2`, rebuild, and update the worker.

**Observe.**
- Lab → Caches → Buckets: both `…-v1` and `…-v2` while the new worker is installing and the old one is active. The old buckets carry "superseded".
- After `activate` finishes: only `v2`. Bench → Versioned caches shows one version per family and no warning.
- Lab → Environment → **Storage**: the per-type usage breakdown for `caches`. Forget the cleanup and it grows with every release.
- Press **Send clear-caches**, confirm, and watch Lab → Caches → Buckets empty out.

**Break it.**
- Leave the cleanup out and release three times. Three generations side by side.
- Change a cached JSON shape and keep the cache name. Lab → Chaos → Presets → **Schema drift** is the mirror image: a cache that outlives a change to what it stores serves the old shape to new code.

**Pitfalls.**
- Delete only your own caches. Other code on the origin, a library for instance, may own buckets whose names you do not recognise.
- With `skipWaiting`, the new worker's `activate` can delete the buckets that the old page, still running, is reading. The old tab then misses on its next request.
- A version number that changes on every build discards the warm cache on every deploy. One that never changes keeps stale shapes.
- `caches.delete` resolves `false` for a name that does not exist. That is not an error.

**Done when.** After a version bump and an activation, Lab → Bench → Versioned caches lists exactly one version in each family, and Lab → Caches shows no "superseded" tag.

---

## Exercise 10. The update flow, end to end

**Goal.** Detect a waiting worker, tell the user, let them apply it, reload once, and understand two tabs on two builds.

**Files you edit.** `src/pwa/registration.ts`, `public/sw.js`.

**Concepts.** `ServiceWorkerRegistration.update()`, `updatefound`, the `installed` state with an existing controller, `postMessage` to `registration.waiting`, `skipWaiting`, the `controllerchange` event, `updateViaCache`.

**What the app already does for you.**
- Setting `usePwaStore.updateAvailable` raises a sticky toast "Update ready" with an **Update** action that calls `registration.applyUpdate()`. Clearing the flag removes the toast.
- Settings → **App updates** has two columns: the website version (asks `/api/version` and `/version.json`; no worker needed) and the service worker (re-fetches `sw.js` byte by byte). They are different questions and can disagree.
- Lab → Server → **Release simulator** shows both signals. It prints "Website: In step | Update available | Update required | API mismatch", and a second line "Service worker signal, separate from the above: update waiting|not waiting, state …".
- Lab → Queue → **Open tabs**: every tab of the origin announces itself every 5 s over a BroadcastChannel (version, build id, controller script URL). A tab on a different build carries a **Skew** tag.
- The website-level banner "A newer version is out" has a Reload button. The forced-upgrade gate "Update required" has one button, Reload, no dismissal, and a note saying a service worker holding the old shell can keep it up.

**Do.**
1. Remove `skipWaiting()` from `install`. Keep `clients.claim()` in `activate`.
2. In `register()`, handle `updatefound`: when the new worker reaches `installed` and `navigator.serviceWorker.controller` is set, call `setPwa({ updateAvailable: true })`. Also check `registration.waiting` at startup: the page may open with a worker already waiting.
3. In `applyUpdate()`, post `{ type: 'skip-waiting' }` to `registration.waiting`, not to the controller. In the worker, call `self.skipWaiting()` when it receives it.
4. Listen for `controllerchange` once, and reload with a guard so you reload once. Skip the reload when there was no controller before (the first install).
5. In `checkForUpdate()`, call `registration.update()`.
6. Edit `sw.js` (a comment is enough), rebuild, and press Lab → Worker → Actions → **Check for update**. Then press **Update** in the toast.

**Observe.**
- Lab → Worker → Registrations: `waiting` shows `installed` beside `active`. The comparison plate's `updateAvailable` row reads Match: the store says `true` and so does the browser. Settings → App updates: "New worker waiting" tag and an **Apply update** button.
- After **Update**: the timeline shows `activating`, `activated`, `controllerchange`, and the page reloads once. The timeline is lost on reload, so use **Copy JSON** first if you want to keep it.
- Two tabs: open Lab → Queue in both. Update in tab A. Whether tab B reloads, stays old or breaks depends on your `controllerchange` code and on exercise 9's cleanup. The "Open tabs" table shows each tab's Version and Build. The Controller column holds only the script URL, so two worker versions at the same URL look alike. Use `get-version` (Lab → Worker → **Send get-version**) and answer with `sw-version` to tell them apart.
- Run `npm run release` while a tab is open. After the next version check (60 s by default, or Lab → Server → **Check now**) the tab shows "A newer version is out", independent of the worker.
- **Forced upgrade**: ship a real build first (`npm run release`). Then Lab → Server → Release simulator → **Force upgrade**. A gate covers the app in every tab. Reloading must lift it once the new build is served. If your worker answers the reload from the old shell, the gate stays until the Lab lowers `minClient` (15 s, 30 s or 2 min, your choice in the dialog, or when you open a page under `/lab`).

**Break it.**
- Lab → Server → Header profile → **HTTP cache trap**. `sw.js` gets `max-age=31536000`. With the default registration (`updateViaCache: 'imports'`) Chrome still re-fetches the worker script and finds the update (checked in Chromium). Register with `{ updateViaCache: 'all' }` and the same deploy is never noticed. In both cases `index.html` is a year old in the HTTP cache and your worker's `fetch(event.request)` for the shell gets it. The Registrations card shows the value as `updateViaCache: …`.
- `registration.update()` while offline, or while `sw.js` is 404: it rejects. Catch it.
- DevTools **Update on reload** ticked: every reload installs and activates the worker. A `controllerchange` reload handler without a guard then loops.

**Pitfalls.**
- `postMessage({ type: 'skip-waiting' })` to `navigator.serviceWorker.controller` reaches the old worker. Lab → Worker → **Send skip-waiting** does that, by design. It is the wrong target for applying an update.
- `skipWaiting` in `install` plus `clients.claim` switches the code under an open page. The old page may then ask for chunks the new worker's cache no longer holds.
- Decide whether `controllerchange` reloads every tab or only the one that clicked Update. Leaving the others on old JavaScript under a new worker is a choice with consequences; a reload of a tab with an unsent draft is another.
- `updateAvailable` must go back to false when the new worker takes over, or the toast and the comparison plate disagree.
- The worker's name matters here: only the exact path `/sw.js` follows the header profile.

**Done when.** Lab → Worker → The store against the browser reads Match for `updateAvailable` both while a worker waits and after it takes over. After **Update** all tabs of the origin list the same Build in Lab → Queue → Open tabs, and Lab → Server → Release simulator reads "update not waiting".

---

## Exercise 11. Background Sync: the outbox for new dispatches

**Goal.** Store a dispatch that failed on the network in IndexedDB and let the worker send it later, once, even with no tab open.

**Files you edit.** `src/pwa/sync.ts`, `public/sw.js`.

**Concepts.** IndexedDB, `registration.sync.register(tag)`, the `sync` event and `SyncEvent.lastChance`, `Idempotency-Key`, `Retry-After`, `Clients.matchAll`, `navigator.locks`.

**What the app already does for you.**
- On a failed submit with error kind `network`, `offline`, `timeout`, `unavailable` or `server`, the app calls `sync.queueDispatch(input)` with the validated `DispatchCreate`. On success it toasts "Queued" and goes to `/drafts`. If the seam throws "not implemented" it keeps the dispatch as a local draft and says so; any other error is shown as a queue failure.
- The idempotency key is the dispatch's `clientId`; the record id must be the same value. Replays of a key return the first dispatch with HTTP 200 and `Idempotent-Replay: true`, logged by the server with the note `idempotent-replay`.
- Drafts → **Outbox** lists what `sync.listQueued()` returns, validated against the `OutboxItem` schema, with **Retry all now** (`sync.flushNow()`) and a remove button (`sync.removeQueued(id)`). Lab → Queue → **Outbox** shows the same list. The strip and nav show a **QUEUE N** count from `usePwaStore.queuedCount`.
- On a valid `sync-complete` message the page invalidates the feed and the inbox, re-reads the outbox, and toasts "Outbox sent" or "Outbox partly sent": "N filed, M still waiting."
- Filing needs a session cookie, which the worker's `fetch` sends automatically. The session lasts 10 minutes by default.

**Do.**
1. Open the database and store named in `shared/sw-protocol.ts` (`outpost-outbox`, store `outbox`, key path `id`). `queueDispatch(input)` writes an `OutboxItem`: `id` = `input.clientId`, `createdAt` an ISO string from `toISOString()`, `attempts` 0, `status` `'queued'`, `lastError` null, `payload` = input. Registering the same id twice must not make two records.
2. Register the `outbox-flush` tag. When `registration.sync` is missing, still store the item and skip the registration.
3. Implement `listQueued`, `removeQueued`, and `flushNow` (replay from the page). Update `queuedCount` with `setPwa` after each.
4. In the worker's `sync` handler, read the store and `POST /api/dispatches` for each item with `Content-Type: application/json` and `Idempotency-Key: <id>`. `event.waitUntil` the whole job.
5. Act on the answer per `docs/CONTRACTS.md`: 201 and 200-with-`Idempotent-Replay` delete the record; 401 and 422 mark it `failed` with `lastError`; 429 waits at least `Retry-After`; 5xx and network errors keep it and increment `attempts`.
6. When done, post `{ type: 'sync-complete', tag, succeeded, failed }` to clients and on the `outpost-sw` channel.

**Observe.**
- Clock in first (the compose page asks, or Lab → Server → Session control). Then Lab → Chaos → Presets → **Hard down**, file a dispatch on `/file`. It leaves `/file` for `/drafts` with an Outbox row, status `queued`. The strip reads QUEUE 1.
- Lab → Queue → Seam board: `sync.queueDispatch`, `sync.listQueued` OK. `sync.removeQueued` after you press the trash icon; `sync.flushNow` after **Retry all now**.
- In Chrome the `sync` event fires right away when you register while it believes it is online. With **Hard down** the browser never went offline, so the first attempt fails at once and the browser schedules its own, slower retry. For a clean test use DevTools **Offline**: the event fires when you untick it. To force it, Application → Service workers → **Sync**, tag `outbox-flush`; Application → Background services → Background Sync records the events. Verify the timing in your Chrome version.
- After a successful replay: the Outbox is empty, the toast says "Outbox sent: 1 filed, 0 still waiting.", Lab → Worker → Message log has a valid `sync-complete`, and `curl 'localhost:4000/api/dispatches?limit=1'` shows `total` up by exactly one.
- Press **Retry all now** on a second tab, or let both the page and the worker replay: Lab → Network → Server shows the second POST with the note `idempotent-replay`, still one dispatch.

**Break it.**
- Presets **Dropped writes** (half of POSTs lose the socket), **Flaky API**, **Rate limited** (429, `Retry-After: 5`, half of requests), **Hard down**.
- Lab → Server → Session control → **Expire now**, then replay. The answer is 401. The item must end up `failed` with a readable `lastError`, visible in the "Last error" column of Lab → Queue → Outbox, not looping and not silently deleted. Clock in again, **Retry all now**.
- Close the tab mid-replay. The next page load must read the truth from IndexedDB through `listQueued`.

**Pitfalls.**
- Do not intercept `POST /api/dispatches` in the `fetch` handler and answer 202. The page then believes it was filed, and the draft disappears.
- `z.iso.datetime()` accepts only ISO strings. `Date.now()` in `createdAt` makes `listQueued` fail validation and the Outbox plate shows an error.
- Write `status: 'sending'` and the new `attempts` to the record before the POST, so a replay that crashes leaves an honest record.
- Two replayers racing (the `sync` event and **Retry all now**) are why `navigator.locks` exists, and why the idempotency key matters. The Environment capability matrix lists Web Locks.
- Safari and Firefox have no Background Sync. `flushNow()` is then the only path (see exercise 16).
- `sync` retries are the browser's, with backoff. A handler that swallows errors never gets a retry. Reject so the browser reschedules, and use `event.lastChance` to decide when to stop.
- The replay code lives in two places, the worker and `flushNow()`. They will drift. Share a module through a build, or have `flushNow` message the worker. The contract has no flush message; the app accepts unknown ones and only validates worker-to-page messages.

**Done when.** The `sync.queueDispatch`, `sync.listQueued`, `sync.removeQueued` and `sync.flushNow` tiles on Lab → Queue → Seam board all read OK, a dispatch filed under **Hard down** or DevTools **Offline** appears in the server's log exactly once after the link returns, and the Outbox ends empty.

---

## Exercise 12. Push notifications, `notificationclick`, silent pushes

**Goal.** Receive a push with no window open, show it, open the right screen on click, and handle the two silent kinds without a notification.

**Files you edit.** `src/pwa/notifications.ts`, `public/sw.js`.

**Concepts.** `Notification.requestPermission()`, `PushManager.subscribe({ userVisibleOnly, applicationServerKey })`, the `push` event and `PushMessageData.json()`, `ServiceWorkerRegistration.showNotification`, `notificationclick`, `Clients.openWindow`, `Client.focus`, VAPID.

**What the app already does for you.**
- Settings → **Notifications**: **Enable alerts** (asks permission, then subscribes, listing each step), **Send local test** (`showLocal`), **Disable** (`unsubscribePush`). Permission shows as Granted, Blocked, Not asked or Unsupported, and is re-read on window focus.
- The server serves `GET /api/push/vapid` (`{ publicKey }`, base64url), `POST /api/push/subscribe` with `{ subscription, label? }`, `POST /api/push/unsubscribe`, `GET /api/push/subscriptions`, `POST /api/push/send`. Posting a bare subscription instead of the wrapper is a 422.
- Lab → Server → **Push console**: the VAPID key, the **Subscriptions** table, and a form. Presets: **New dispatch**, **Custom**, **Silent badge update**, **Sync poke**, **Long-running**, **With actions**. Fields: URL on click, Tag, Badge count in the payload (**Current unread**, **Set to N**, **Leave alone**), TTL, Delay (0 to 300 s), Urgency, Send to, Require interaction. A preview titled "Payload the worker will receive" shows the `PushPayload`, and a guide describes what your worker should do for the chosen preset.
- On a valid `navigate` message the page routes to a same-origin URL. On `push-received` it raises a toast with an **Open** action, unless the payload is silent.
- The server delivers to a real push service (for Chrome, FCM), so it needs an internet connection. A subscription the push service reports gone (404 or 410) is pruned.

**Do.**
1. `requestPermission()`: call `Notification.requestPermission()`, return the string. `subscribePush()`: fetch the VAPID key, convert it to bytes, subscribe with `userVisibleOnly: true`, then POST `{ subscription: subscription.toJSON() }` to the server. Return the JSON, write `pushSubscribed` and `notificationPermission` to the store.
2. `getSubscription`, `unsubscribePush` (unsubscribe in the browser and tell the server), and `showLocal` through `registration.showNotification`.
3. In the worker's `push` handler, read `event.data.json()`. If `silent` is false, call `showNotification` with the payload's `title`, `body`, `icon`, `image`, `tag`, `actions`, `requireInteraction`, and put `url` and `dispatchId` in `data`. Wrap it in `event.waitUntil`.
4. If `silent` is true, do not show a notification. For `silent-badge`, apply `badgeCount` (exercise 13). For `sync-poke`, kick the outbox flush or a digest refresh.
5. In `notificationclick`: close the notification, read `data.url` and `event.action`, and look for a window client. If there is one, focus it and `postMessage({ type: 'navigate', url })`; otherwise `clients.openWindow(url)`.
6. Optionally post `push-received` to open windows so the page can toast instead.

**Observe.**
- Settings → Notifications → **Enable alerts**: steps "Ask for permission" then "Subscribe to push and register with the server" end OK. The Subscriptions table in the Push console lists the browser with a "Last send" tag (`never`, then `ok` or `failed`). Lab → Worker → Registrations → **Push subscription** shows the endpoint's last 12 characters, which is the **Tail** column in the console. The store comparison reads Match for `pushSubscribed`.
- Push console → **New dispatch** → **Send push**: the result shows attempted and delivered counts, a notification appears, and a click opens `/log/<id>`. With a window open, Lab → Worker → Message log shows a valid `navigate` row with the note "navigated to /log/…".
- **Silent badge update** and **Sync poke** show nothing. Chrome's rule is that a push must result in a visible notification. If the handler shows none, Chrome posts a generic one, unless a window is visible and focused. Verify this in your browser; the console's guide text says the same.
- **Delay** 20 s, then close every tab of Outpost. The push arrives with no window: `clients.matchAll()` is empty, and the click has to go through `openWindow`.
- Lab → Server → Wire simulator → **Push on each new dispatch** plus **File 1 now**: one push per new dispatch.

**Break it.**
- Block notifications in the browser's site settings. The card shows Blocked and disables **Enable alerts** and **Send local test**. A `subscribePush()` that rejects with `NotAllowedError` is classified as kind `permission` and the step reads denied, not failed.
- Remove the row from the console's Subscriptions table, then send: attempted 0. The table is the relay's list; removing a row does not unsubscribe the browser.
- Send to one subscription with **Send to**.

**Pitfalls.**
- Permission can only be asked from a user gesture. The Settings button is one; `boot()` is not.
- `subscribe` without `userVisibleOnly: true` is rejected by Chrome.
- Some browsers need the key as a `Uint8Array`, not the base64url string.
- `clients.openWindow` works only inside a user-initiated event such as `notificationclick`.
- Use `tag` to replace rather than stack notifications. A `requireInteraction` notification stays until acted on.
- Do not show a notification and also toast in a focused window unless you mean to.
- `event.action` is an empty string for a click on the body, not `undefined`.
- Always return the `showNotification` promise inside `waitUntil`; the worker may be stopped before it resolves.

**Done when.** `notifications.requestPermission`, `subscribePush`, `getSubscription`, `showLocal` and `unsubscribePush` all read OK on the Seam board, and from the Push console a **New dispatch** push shows a notification whose click opens that dispatch, with a `navigate` message in the Worker message log when a window was open.

---

## Exercise 13. The badge, and keeping three counts honest

**Goal.** Reflect the unread count in the app icon, from the page and from a push with no window, and find the places where the numbers disagree.

**Files you edit.** `src/pwa/badge.ts`, `public/sw.js`.

**Concepts.** `navigator.setAppBadge(count)`, `navigator.clearAppBadge()`, both on `self.navigator` in a worker, installed-app requirements, feature detection.

**What the app already does for you.**
- `useBadgeSync`, mounted once in the shell, calls `badge.set(unread)` 300 ms after the inbox unread count changes, skips a value equal to the last one it sent, and calls `badge.clear()` at 0. It calls quietly: while the seam is a stub or the browser lacks the API, nothing is shown.
- Settings → **Badge**: a test field (1 to 99999), **Set badge**, **Clear badge**. A value set there is replaced the next time the unread count changes.
- The Inbox page has a **Badge** plate with "On screen", "Asked of the OS" and "Server count" (it reads "not checked" until you press **Ask the server**), and a verdict tag (Agree, Differs, or Idle before the first badge call) with a line such as "Screen and badge agree." or "The OS badge was last set to N; the screen says M.".
- The Lab cannot read the OS badge. Lab → Consistency's **Badge** column is what the app last asked for, taken from the call log. It marks the value "inferred" if the call predates the page.

**Do.**
1. `set(count)`: feature-detect `'setAppBadge' in navigator`; if missing throw a `NotSupportedError`; otherwise `await navigator.setAppBadge(count)`. `clear()` likewise.
2. In the worker, apply `badgeCount` from a push payload: a number sets, `0` clears, `null` leaves it alone.
3. Install the app to see the icon change (the steps are in exercise 15; come back to this check afterwards), then open the Inbox.
4. Mark dispatches read and watch the badge follow, 300 ms later.

**Observe.**
- Lab → Queue → Seam board: `badge.set` and `badge.clear` OK. Before you wrote anything, `badge.set` already read Not wired, because the shell calls it on its own once the inbox loads.
- Lab → Consistency → Inbox table → **Unread** row across **Server truth**, **React cache**, **Cache Storage** and **Badge**. Use Levers → **Change behind React's back** (field **Read**) to move the server count without telling React, then watch the row go to Mismatch and the diagnosis name the layer.
- Inbox page → Badge plate: the three numbers on one screen. Press **Ask the server** to fill in the third.
- Push console → **Silent badge update**, Badge count **Set to N**: the OS badge changes, React does not. Now the badge differs from the screen. That is the exercise's mismatch: the worker wrote a number the page did not.
- Spawn a wire dispatch (Wire simulator → **File 1 now**) and see which of the layers learns first.

**Break it.**
- In the console, `delete Navigator.prototype.setAppBadge`, then change an unread count by marking a dispatch read. The next call throws; the Seam board shows an error with kind `unsupported`, filed silently. Reload to restore.
- Send a **Silent badge update** with the page closed and then open the app. The page's next `set` overwrites the worker's number. Decide which is right: the server's count at send time (the default in the payload) is not the same as the count React holds with optimistic updates in flight.

**Pitfalls.**
- Desktop Chrome shows an app badge only for an installed app. In a tab the call is accepted and nothing appears. Android shows a dot rather than a number.
- Two writers, one badge. The last write wins, and neither knows what the other wrote.
- `setAppBadge(0)` clears. The app already routes 0 to `clear`.
- A badge call that is quiet and fails leaves nothing on screen. The bridge log is where it shows.

**Done when.** `badge.set` and `badge.clear` read OK on the Seam board, and in an installed app the icon count follows the unread count within a second of a change. In Lab → Consistency the Unread row shows Match across the layers you have wired.

---

## Exercise 14. Periodic Background Sync

**Goal.** Let the browser wake the worker now and then to fetch the digest, refresh the cache and the badge, and tell any open window.

**Files you edit.** `src/pwa/periodic-sync.ts`, `public/sw.js`.

**Concepts.** `registration.periodicSync.register(tag, { minInterval })`, `getTags()`, `unregister`, the `periodicsync` event, `navigator.permissions.query({ name: 'periodic-background-sync' })`, site engagement.

**What the app already does for you.**
- Settings → **Background refresh**: a switch "Refresh the digest in the background", an **Asked interval** (every 15 minutes, hour or 12 hours) and **Ask the browser for its tags**. A tag reads "API present" or "API missing", and the card shows whether the app is installed.
- `periodicSync.isSupported()` already answers.
- The server's `GET /api/digest?since=<iso>` returns items filed after `since` (newest first, at most 20; no `since` means the last 24 hours), with `newCount`, `urgentCount` and `unread`.
- On `periodic-sync-complete` the page invalidates the digest and inbox queries, with no toast.
- The tag name is `digest-refresh`.

**Do.**
1. `register(tag, minIntervalMs)`: query the permission first; if it is not granted, throw `NotAllowedError`. Then `registration.periodicSync.register(tag, { minInterval })`. Keep `periodicTags` in the store in step with `getTags()`.
2. `unregister(tag)` and `list()` from `getTags()`.
3. In the worker's `periodicsync` handler for `digest-refresh`: remember the last time you looked (IndexedDB or a cache entry), fetch `/api/digest?since=<that>`, store the response, update the badge from `unread`, and show a notification only when `urgentCount` is above zero. Then post `periodic-sync-complete` with the tag and `newCount`.
4. Use Lab → Server → Wire simulator → **File 1 now** to give the digest something new.
5. In Chrome, install the app, open Settings → Background refresh, switch it on, and trigger the event from DevTools: Application → Service workers → **Periodic Sync**, tag `digest-refresh`.

**Observe.**
- Lab → Worker → Registrations → **Periodic tags**: "digest-refresh". The store comparison's `periodicTags` row reads Match. Where the browser has no API, the Registrations card says "not in this browser"; where listing throws, it says "read failed". In both cases the comparison row says "cannot be read".
- Lab → Worker → Message log: a valid `periodic-sync-complete` row.
- Lab → Network: a `GET /api/digest?since=…` row that should read "Server only" with no tab id, because the worker, not a tab, made it.
- Lab → Queue → Seam board: `periodicSync.register`, `periodicSync.unregister`, `periodicSync.list`.

**Break it.**
- Run it in a browser tab, not an installed app. `register` should end in `NotAllowedError` and the card says "The browser will not allow periodic sync for this site. It usually needs an installed app."
- In a browser with no API: Firefox and Safari. The card says "API missing" and **register** reports "This browser has no Periodic Background Sync." Your `register` throws `NotSupportedError`; `list()` returns an empty list.
- **Hard down** during a triggered event: the handler fails and must not post a success message.

**Pitfalls.**
- Chromium only, installed apps only, and the browser decides when. `minInterval` is a request. Expect hours, not minutes, and nothing you can rely on.
- The handler must finish inside `waitUntil` quickly. It cannot assume a window.
- Dedupe notifications with a `tag`, or every run stacks another.
- `periodicSync.isSupported()` says true in a Chrome tab that is not an installed app (observed in Chrome 152), where `register` still fails with `NotAllowedError: Permission denied.` Support and permission are separate.

**Done when.** The `periodicSync.register`, `unregister` and `list` tiles read OK, and triggering the event from DevTools produces a `periodic-sync-complete` row in the Message log and a digest request in Lab → Network.

---

## Exercise 15. Share, share target, shortcuts, protocol handler, install, manifest

**Goal.** Make the app installable, offer an install button, accept shares and `web+outpost://` links, and share out of the app.

**Files you edit.** `public/manifest.webmanifest` (new), `index.html`, `src/pwa/install.ts`, `src/pwa/share.ts`.

**Concepts.** Web app manifest members (`name`, `short_name`, `start_url`, `scope`, `id`, `display`, `theme_color`, `background_color`, `icons`, `shortcuts`, `share_target`, `protocol_handlers`, `launch_handler`), the `beforeinstallprompt` and `appinstalled` events, `navigator.share`, `navigator.canShare`.

**What the app already does for you.**
- `public/icons/` holds `icon-192.png`, `icon-512.png`, `maskable-512.png` and `apple-touch-icon.png` (180 px). `index.html` carries the manifest and apple-touch-icon links as a comment.
- The server serves `.webmanifest` as `application/manifest+json` and gives `/manifest.webmanifest` the header profile's cache policy.
- The routes the manifest targets exist: shortcuts `/file`, `/inbox`, `/signal`; share target `/share-target` (reads `?title`, `?text`, `?url`, and offers "Create dispatch from this" or "Discard"); protocol handler `/handle` (reads `?uri=web+outpost://dispatch/<id>`, `…/station/<code>`, `…/handbook/<slug>`, and refuses anything else); `/file` prefills from `?title&text&url&station`.
- Lab → Environment → **Manifest and installability** finds the linked manifest, fetches it bypassing the HTTP cache, prints it, and runs a checklist. The tally reads "N pass, N warn, N fail, N note". Groups: Identity, Launch, Icons, Integration, Environment.
- Settings → **Install**: "Display mode", "Standalone", "Install prompt stored", and **Install app** (disabled when already installed, "Already installed"). It lists how each browser installs by hand.
- The Share button on a dispatch reads **Share** when `share.canShare` is true and **Copy link** otherwise. Chapters have a Share button too. A cancelled share says nothing; an unsupported one copies the link.

**Do.**
1. Write the manifest. Targets the checklist verifies: `name` and `short_name` (12 characters or fewer), `start_url` that is a route (for example `/log`), `scope` containing it, `id`, `display` of `standalone`, `fullscreen` or `minimal-ui`, `theme_color`, `background_color`; icons 192 and 512 with purpose `any`, plus a separate maskable icon; three shortcuts to `/file`, `/inbox`, `/signal`; `share_target` with action `/share-target`, method `GET` and `params` mapping `title`, `text`, `url`; `protocol_handlers` with protocol `web+outpost` and a url containing `%s` that lands on `/handle`; optionally `launch_handler.client_mode` (`auto`, `navigate-new`, `navigate-existing` or `focus-existing`).
2. Add `<link rel="manifest" href="/manifest.webmanifest">` and the apple-touch-icon link to `index.html`. Rebuild; both files go through `dist/`.
3. In `install.ts`, at module level, listen for `beforeinstallprompt`, call `preventDefault()`, stash the event, and `setPwa({ installPromptAvailable: true })`. Listen for `appinstalled`. `prompt()`: if nothing is stashed, return `'unavailable'`; otherwise `await event.prompt()`, read `userChoice`, clear the stash and the flag (an event can be used once), return `'accepted'` or `'dismissed'`.
4. In `share.ts`, `canShare(data)` calls `navigator.canShare` when it exists, else returns `false`; `share(data)` calls `navigator.share`, maps `AbortError` to `'cancelled'`, and returns `'unsupported'` when `navigator.share` is missing.
5. Test the target without a share sheet: open `/share-target?title=Barometer%20falling&text=Pressure%20down%2011%20hPa` directly. Test the handler with `/handle?uri=web%2Boutpost%3A%2F%2Fdispatch%2Fdp-000001`; it redirects to `/log/dp-000001`. Encode the `+`: a literal `+` in a query string decodes to a space and the page answers "Not an Outpost link".

**Observe.**
- Lab → Environment → Manifest and installability: before the link, "No manifest is linked", with the members it will look for. After, a table of Pass, Warn, Fail and Note rows, for example `shortcut …`, `share_target action`, `share_target method`, `share_target params`, `protocol web+outpost` ("/handle receives it in ?uri="), `launch_handler`, and an Environment group with "secure context" and "service worker". It also shows Content-Type and Cache-Control of the manifest as served. Break `start_url` on purpose and reload the Lab.
- A manifest that passes everything except the "service worker" note still may not install until a worker controls the page. Chrome's exact installability rules have shifted over versions; the Lab list and DevTools → Application → **Manifest** are your guides.
- Settings → Install: "Install prompt stored: yes" appears once the browser decides. After **Install app** the outcome line says Accepted or Dismissed. Display mode becomes `standalone` in Lab → Environment → Runtime facts, and in the store.
- Share: Dispatch page → **Share** in a browser with a share sheet; the result is `shared`, `cancelled` or a copy-link fallback. In Chrome on Linux `navigator.share` is typically absent: Lab → Environment → Capability matrix, row "Web Share (and canShare files)".

**Break it.**
- A shortcut to a route that does not exist, a `share_target` with `method: 'POST'` (the checklist warns: the page reads GET parameters, so a worker must intercept the POST and redirect to `/share-target?title=&text=&url=`), a `protocol_handlers` url with no `%s`, a `display` of `browser`, a `start_url` outside `scope`. Each produces a named finding.
- Lab → Server → Header profile → **HTTP cache trap**: `/manifest.webmanifest` gets a year of `max-age`. The Lab bypasses the HTTP cache when it fetches the manifest, so a stale copy will not show there, but its Cache-Control row will read `max-age=31536000`; the browser may keep serving the old file.
- A browser with no install event (Safari, Firefox): `prompt()` must return `'unavailable'`, and the Install card lists the manual route.

**Pitfalls.**
- `beforeinstallprompt` can fire before React mounts. Attach the listener when the module loads, not in an effect or inside `boot()` after an `await`.
- A prompt event is single use.
- `short_name` longer than about 12 characters is truncated by launchers.
- Combine `any` and `maskable` in one icon and you get an oversized plain icon; ship two files.
- `start_url` is part of the app's identity unless you set `id`. Changing it later makes the browser treat the app as another one.
- iOS Safari takes the home-screen icon from the `apple-touch-icon` link.
- `navigator.share` needs a user gesture and a secure context, and not every desktop has a share sheet.
- Share targets and protocol handlers register for installed apps and show up in OS UI. They are the least testable part of this exercise on a desktop.

**Done when.** The checklist at Lab → Environment → Manifest and installability reads 0 fail with the shortcut, share target and protocol handler rows passing; Settings → Install shows "Install prompt stored: yes" and **Install app** returns Accepted; `install.prompt` and `share.share` tiles read OK where the browser supports them.

---

## Exercise 16. Break it on purpose, and handle it

**Goal.** Put every failure the Lab can produce in front of your worker and your seams, and decide, per failure, what the user sees.

**Files you edit.** `public/sw.js`, `src/pwa/*`.

**Concepts.** Response validation before `cache.put`, `Retry-After`, `QuotaExceededError`, `navigator.storage.persist()`, React Query persistence and its buster, feature detection.

**What the app already does for you.** The whole of the Lab: Chaos, Errors, Query, Environment. Lab → Chaos → **Expected against observed** counts "N of 12 seen" over all failure modes; **Results** records each probe.

**Break it.** The whole exercise is this. The sections below are the failures, in the order to try them: bad bodies, schema drift, rate limits, quota, missing APIs.

### Captive portal and corrupt bodies

| preset (Lab → Chaos → Presets) | what arrives | the page reports | the worker must |
|---|---|---|---|
| **Captive portal** | 200, `text/html`, a sign-in page | `parse` ("a captive portal or a stale page may be in the way") | check the content type before storing; never serve it as an API answer |
| **Corrupt JSON** | 200 JSON that stops being JSON | `parse` | parse, or at least validate, before storing |
| **Empty 200** | 200, zero bytes | `parse` | refuse an empty body |
| **Truncated feed** | 200, then the socket dies | `network`, raised while reading | not keep a half-written entry; compare length to `Content-Length` |
| **Slow body** | headers at once, body over ~6 s | none, or `timeout` | not hold the page on a stream; `fetch` resolved at headers |

The captive-portal preset covers `/api` only; navigations are not affected.

### Schema drift against stored copies

1. Warm the cache with the worker running.
2. Lab → Chaos → Master switches → **Schema drift**. Dispatch payloads change shape on `/api/dispatches*` and in digest items (snake_case, a numeric `level`, no `severity`). The envelope, the status and `X-Api-Version: 1` stay the same; the `ETag` changes, so a stored validator does not match. The page rejects fresh answers as `schema-mismatch`. A copy from before the switch still parses, which is the trap.
3. A network-first worker that stores the drifted 200 poisons its own cache. Validate the shape you rely on before storing, or key by something that changes. The version header will not tell you: `PUT /api/_lab/release` with `{"api":2}` changes `X-Api-Version`, schema drift does not.

React Query holds a second copy:
- Lab → Query → Settings → **Persist the query cache** (applies on reload) saves successful queries to IndexedDB. **Cache buster**: `version`, `build` or `none`, applied on reload. The saved string is `v<version>`, `b<build id>` or empty. A mismatch on restore discards the whole saved cache.
- Lab → Query → **Persistence** shows "Buster stored" and "Against the setting": "matches: restored on reload" or "differs: the whole cache is discarded on reload". With `none`, a copy written by an older build comes back unchecked, because zod runs on fetch, not on hydrate.
- Try it: persistence on, buster `build`, use the app, `npx vite build`, reload: discarded. Same with `none`: restored.
- **Corrupt persisted cache**, then reload. The persister rejects the record, deletes it and reports the failure in Lab → Errors.

### Rate limits

Lab → Chaos → Presets → **Rate limited**: half of `/api` requests answer 429 with `Retry-After: 5`. The page reports `rate-limited` and carries the wait. Filing shows a countdown (10 s if no header). A worker must not store a 429. A replay loop must wait at least `Retry-After`, or the next replay is refused as well. Watch Lab → Network for the 429 rows and the outbox `attempts` count.

### Quota and eviction

- Lab → Environment → **Storage**: the quota meter, "Persisted: no, best effort" or "yes, exempt from eviction", and **Request persistent storage** (the Lab's own `navigator.storage.persist()` call). No seam wraps it. If your app should ask, call it from `src/pwa/*`, for example after installing.
- `cache.put`, `addAll` and IndexedDB writes can throw `QuotaExceededError`. In a seam, let it propagate as that `DOMException` name so the page files it as `quota` (Lab → Errors → Error simulator → **Throw QuotaExceededError** shows the classification). In the worker, catch it on a media write and trim the cache; for the outbox, fail loudly: `queueDispatch` throwing makes the page show a queue failure and keep the draft.
- Eviction removes whole origins' storage when the disk is full and storage is not persistent. Simulate it: Lab → Caches → **Delete all**, and Application → Storage → Clear site data. Your worker must answer misses from the network, not crash, and must not assume `install` precache survives. The outbox is IndexedDB too.

### Unsupported browsers

What each seam should do when the API is missing, and what the page makes of it:

| seam | when missing | page shows |
|---|---|---|
| `registration.register` | return without registering | an ordinary website; strip shows "sw none" |
| `registration.checkForUpdate`, `applyUpdate` | throw `NotSupportedError` | "This browser does not offer that." |
| `registration.unregister` | resolve `false` | "unregister() resolved false: there was no registration to remove." |
| `install.prompt` | return `'unavailable'` | "No install prompt is available to this page right now." and the manual routes |
| `notifications.permission` | return `'unsupported'` (the stub already does) | Settings disables the buttons |
| `notifications.subscribePush` | throw `NotSupportedError` | the subscribe step fails with "This browser does not support that feature." |
| `notifications.getSubscription` | resolve `null` | no subscription |
| `sync.queueDispatch` | still store; skip `registration.sync` | the item sits in the Outbox; **Retry all now** is the user's retry |
| `sync.flushNow` | replay from the page | outbox drains |
| `periodicSync.isSupported` | return `false` (the stub already does) | "API missing" |
| `periodicSync.register` | throw `NotSupportedError` | "This browser has no Periodic Background Sync." |
| `periodicSync.list` | resolve `[]` | "The browser lists no tags." |
| `badge.set`, `badge.clear` | throw `NotSupportedError` | "This browser has no Badging API." in Settings; silent elsewhere |
| `share.canShare` | return `false` | **Copy link** instead of **Share** |
| `share.share` | return `'unsupported'` | "This browser cannot share." and the link is copied |

Lab → Environment → **Capability matrix** has a column "When missing, the app…" per row, and a Show filter (All, Supported, Partial, Missing). Test without another browser by deleting an API in the console before the call, for example `delete Navigator.prototype.setAppBadge`. Firefox and Safari are the real tests: no Background Sync, no Periodic Sync, no badge, no install event.

**Do.** Work down the tables above with your worker running. For each preset, write down in a line what the page should show, run it through Lab → Chaos → **Probe** (target the URL in question, **Fire** five times), and compare with **Results**. Fix the worker until they agree.

**Observe.** Lab → Chaos → **Expected against observed**: each mode flips from "Not yet" to "Seen N times". Lab → Caches: no HTML, error or drifted body among the entries. Lab → Errors: every failure you caused is filed with its kind. Cancelled queries (`aborted` from `apiFetch`) are not filed; quiet seam calls are filed without a toast.

**Pitfalls.**
- Rule order matters in Chaos: the first enabled matching rule wins. **Lie-fi** covers all of `/api` and shadows later `/api` rules; the Rules plate marks a shadowed rule.
- Presets toggle: pressing a preset that is on switches it off. **All clear** turns every switch and rule off.
- A cleanup that runs only on `activate` does not repair a cache poisoned by an old version. Offer `clear-caches` (exercise 9) and a version bump.
- The Lab's own endpoints (`/api/_lab/*`) are exempt from chaos, so the way out always works. Keep your worker out of their way.

**Done when.** Each preset in Lab → Chaos leaves the app in a state you decided on in advance, with Lab → Caches free of bad bodies; Lab → Chaos → Expected against observed reads all modes "Seen"; and with `delete Navigator.prototype.setAppBadge` or in a browser without the APIs, every seam in the table degrades as listed instead of crashing.

---

## Reading list

Concept names to search on MDN and web.dev. No links; the names are stable and the pages move.

- Service worker lifecycle; `ServiceWorkerRegistration`; `ServiceWorkerContainer.ready`; `updateViaCache`; `skipWaiting()`; `Clients.claim()`; `controllerchange`; `ExtendableEvent.waitUntil()`
- Cache Storage API: `Cache.put()`, `Cache.add()`, `Cache.addAll()`, `CacheStorage.match()`, `ignoreSearch`, `ignoreVary`
- `FetchEvent.respondWith()`; `Request.mode`, `Request.cache`; `Response.clone()`; opaque responses
- Caching strategies: cache-first, network-first, stale-while-revalidate, cache-only, network-only; the Workbox strategy names (`CacheFirst`, `NetworkFirst`, `StaleWhileRevalidate`) for the vocabulary
- Navigation Preload; the app shell model; `Response.redirect()`
- HTTP caching: `Cache-Control` (`no-cache` against `no-store`, `max-age`, `immutable`), `ETag`, `If-None-Match`, 304; RFC 5861 (`stale-while-revalidate`)
- Hashed asset names and long-lived caching; dynamic `import()` failures after a deploy
- Background Synchronization API: `SyncManager`, the `sync` event, `SyncEvent.lastChance`; `Idempotency-Key` header; `Retry-After`; IndexedDB; Web Locks API
- Push API: `PushManager.subscribe()`, `userVisibleOnly`, `applicationServerKey`, `PushMessageData`; VAPID (RFC 8292); Web Push protocol (RFC 8030); Notifications API: `showNotification()`, `notificationclick`, notification actions, `tag`, `requireInteraction`; `Clients.openWindow()`, `Clients.matchAll()`
- Badging API: `setAppBadge()`, `clearAppBadge()`
- Periodic Background Sync: `PeriodicSyncManager`, the `periodicsync` event, the `periodic-background-sync` permission, site engagement
- Web app manifest members; installability criteria; `beforeinstallprompt`; `appinstalled`; maskable icons; manifest `id`; shortcuts; `share_target`; `protocol_handlers`; `launch_handler`
- Web Share API: `navigator.share()`, `navigator.canShare()`; Web Share Target
- Storage API: `StorageManager.estimate()`, `persist()`, `persisted()`; storage eviction and quota; `QuotaExceededError`
- `BroadcastChannel`; `Client.postMessage`; `MessageChannel`
- Resource Timing: `transferSize`, `deliveryType`

## Checklist: exercises to Lab pages

The right-hand column is the 15-item tick list on the Lab home page, which numbers the same work differently.

| # | exercise | watch | done signal | Lab home item |
|---|---|---|---|---|
| 1 | Register and read the lifecycle | Worker; Queue | store comparison Match; "Controls this page" | 1 |
| 2 | Install, activate, precache the shell | Caches (Precheck); Worker | `/` HIT, `/assets/*` entries; offline shell | 7 (shell) |
| 3 | Cache-only, handbook, `delta` | Bench (Never precached); Caches; Handbook | expected miss on `delta`; "All 8 chapters…" | 2 |
| 4 | Cache-first for media and assets | Bench (cache first); Network; Server (No store) | Hits + 0, "STALE by 1 rev" | 3 |
| 5 | Network-first with timeout | Bench (Server down); Chaos (Lie-fi, Probe); Network | opens in the timeout, "Stored copy" | 4 |
| 6 | Stale-while-revalidate and `cache-updated` | Bench; Worker (Message log); Consistency | `cache-updated` row with a count | 5 |
| 7 | Network-only done properly | Bench (network only); Signal page | no "Possibly cached"; Hits + 1 | 6 |
| 8 | Offline navigation, chunks | Caches (Precheck); Chaos (Stale chunks, Hard down); Errors | offline route paints; "Loading failed" only for uncached | 7 |
| 9 | Versioned caches | Caches; Bench (Versioned caches); Environment (Storage) | one version per family | 8 |
| 10 | Update flow | Worker; Queue (Open tabs); Server (Release simulator, Header profile) | `updateAvailable` Match; same Build in all tabs | 9 |
| 11 | Background Sync outbox | Queue (Seam board, Outbox); Chaos; Server (Session control); Network | four `sync.*` tiles OK; one dispatch on the server | 10 |
| 12 | Push, `notificationclick`, silent pushes | Server (Push console); Worker (Message log); Settings | five `notifications.*` tiles OK; click opens the dispatch | 11 |
| 13 | Badge and consistency | Consistency; Inbox (Badge plate); Queue; Settings | `badge.set`, `badge.clear` OK; Unread row Match | 11 |
| 14 | Periodic Background Sync | Settings; Worker; Network; Queue | `periodic-sync-complete` row | 12 |
| 15 | Share, share target, shortcuts, protocol handler, install, manifest | Environment (Manifest and installability); Settings (Install) | 0 fail; Install returns Accepted | 13, 14 |
| 16 | Break it and handle it | Chaos (all); Errors; Query; Environment (Storage, Capability matrix); Caches | every mode "Seen"; no bad bodies in Caches | 15 |
