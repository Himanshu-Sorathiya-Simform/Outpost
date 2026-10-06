# Contracts

Reference for writing the service worker, the manifest and the `src/pwa/*` seams. It describes what the app and the server do today, not what a finished PWA should do. Where a statement is about the browser rather than this repo it says so.

Sources of truth, in order: `shared/contracts.ts` (schemas, header names, URL builders), `shared/sw-protocol.ts` (worker messages, names), `server/*` (behaviour), `src/lib/api/*` and `src/lib/bridge/*` (how the page reads responses and messages). Where a comment in those files disagrees with the code, this file follows the code. The places it matters:

- `WireState.pushOnNew` is commented "also send a push to every subscription for each new wire dispatch". The server sends one for every newly created dispatch, including one filed through `POST /api/dispatches`. A background-sync replay of your own dispatch therefore pushes to your own device when it is on.
- The `src/pwa/sync.ts` comment says to delete the outbox item on "2xx/409-replay". A replay is answered 200 with `Idempotent-Replay: true`; no route sends 409 for it.
- `ERROR_CODES` lists `gone`, `unavailable` and a 409 `conflict`. No route emits them. Only a chaos `status` rule does (410, 502/503/504, 409).

Conventions in this file:

- The origin is whatever serves the app. `npm run pwa` serves everything from `http://localhost:4000`. `npm run dev` serves the page from `:5173` and proxies only `/api` and `/media` to `:4000`; the header profiles (section 4) apply only to responses from the Node server.
- Paths are shown without the origin. A worker sees absolute URLs; match on `url.pathname`.
- "Page" means app code in a window. "Worker" means the service worker you write.
- Server routes match exactly: `/api/ping/` and `/API/ping` are 404. Match the same way.

Contents

1. URL map
2. Response headers
3. Request headers
4. Cache-header profiles
5. Errors
6. Session cookie
7. Background Sync
8. Periodic Sync
9. Push
10. Page and worker messages
11. Manifest
12. Chaos and the lab endpoints

---

## 1. URL map

### 1.1 Everything the app requests

Auth column: "session" means the request needs the `outpost_sid` cookie (section 6); "-" means no check. The strategy column is what the app is built to show, taken from the Lab learning path (`src/lab/home/learning-path.ts`) and the strategy bench. Nothing enforces it. "Exercise N" is the numbering of `docs/LEARNING.md`; the Lab home list numbers the same work differently.

| Pattern | Method | Returns | Auth | Designed strategy |
|---|---|---|---|---|
| `/`, `/log`, `/log/:id`, `/file`, `/drafts`, `/inbox`, `/stations`, `/stations/:code`, `/signal`, `/handbook`, `/handbook/:slug`, `/settings`, `/offline`, `/share-target`, `/handle`, `/lab`, `/lab/*`, any other path with no file extension | GET (navigation) | the same `index.html`, 200 `text/html`, when the request says `Accept: text/html` (see 1.2). The router picks the screen from `location`. | - | Navigation fallback: network, then the cached shell (exercise 8). See 1.2. |
| `/index.html`, `/favicon.svg`, `/icons/*.png` | GET | the file from `dist/` | - | Precache. |
| `/assets/<name>-<hash>.js\|css\|woff2\|map` | GET | build output, `Cache-Control: public, max-age=31536000, immutable` (realistic) | - | cache-first (exercise 4). Unknown name: 404 `text/plain` `Not found: <path>`, never `index.html`. |
| `/version.json` | GET | `{ version, buildId, builtAt }` | - | network-only. |
| `/sw.js`, `/manifest.webmanifest` | GET | 404 `text/plain` until you add the file to `public/`. Then served with the header profile's value (4) and MIME `text/javascript` / `application/manifest+json`. | - | Not routed by the worker (see 1.3). |
| `/media/dispatch/:id.svg` | GET | contour art, `image/svg+xml`, weak ETag, 40-120 ms artificial delay. Unknown id: 404 JSON. | - | cache-first (exercise 4). |
| `/media/station/:code.svg` | GET | same, keyed by station code. Unknown code: 404 JSON. | - | cache-first (exercise 4). |
| `/api/dispatches?severity&station&q&unread&starred&cursor&limit` | GET | `DispatchPage`, newest first, default `limit` 12, max 50. `X-Resource-Rev` = `feedRev`. ETag. | - | network-first with a 3 s timeout (exercise 5). |
| `/api/dispatches/:id` | GET | `Dispatch`, ETag `W/"<id>-r<rev>"`, `X-Resource-Rev` = rev. | - | network-first. |
| `/api/dispatches` | POST | 201 `Dispatch` (+ `Location`), or 200 on idempotent replay. Body `DispatchCreate`. | session | network-only; on network failure the page queues it (section 7). |
| `/api/dispatches/:id` | PATCH | 200 `Dispatch` with new ETag, 412 on `If-Match` mismatch. Body `DispatchPatch`. | session only when `acked` is in the body | network-only. Not queued: the page rolls the optimistic change back. |
| `/api/inbox/summary` | GET | `InboxSummary`, ETag over the counts only | - | no designated strategy; network-first fits. The badge and the Consistency lab read it. |
| `/api/inbox/read-all` | POST | `InboxSummary`, no ETag | - | network-only. |
| `/api/digest?since=<iso>` | GET | `Digest` (section 8), ETag | - | No page screen renders it today. Called by your `periodicsync` handler. |
| `/api/stations` | GET | `StationList`, ETag over `id:rev` pairs (not `asOf`) | - | stale-while-revalidate (exercise 6). Drifts every 2-4 minutes. |
| `/api/stations/:codeOrId` | GET | `Station`, ETag `W/"<id>-r<rev>"`. Accepts `KRN-07` or `st-krn07`, case-insensitive. | - | stale-while-revalidate. |
| `/api/signal` | GET, HEAD | `SignalBoard`; `seq` increments on every request, HEAD included | - | network-only (exercise 7). |
| `/api/handbook` | GET | `HandbookIndex`, ETag | - | precache, then cache-only (exercise 3). |
| `/api/handbook/:slug` | GET | `HandbookChapter`, ETag. Slugs below. | - | precache, then cache-only. |
| `/api/bench/cache-first/:key` | GET | `BenchResponse` | - | cache-first |
| `/api/bench/network-first/:key` | GET | `BenchResponse` | - | network-first |
| `/api/bench/stale-while-revalidate/:key` | GET | `BenchResponse` | - | stale-while-revalidate |
| `/api/bench/network-only/:key` | GET | `BenchResponse`, always `no-store` | - | network-only |
| `/api/bench/cache-only/:key` | GET | `BenchResponse` | - | cache-only after precache. Key `delta` is the one never to precache. |
| `/api/bench/<strategy>/:key/bump` | POST | `{ rev }` | - | network-only. Makes cached copies stale. |
| `/api/ping` | GET, HEAD | 204, `no-store` | - | network-only. |
| `/api/version` | GET | `VersionInfo` (fetched with `cache: 'no-store'`) | - | network-only. |
| `/api/session` | GET | `{ session: Session \| null }`, always 200 | - | network-only. |
| `/api/session` | POST | sets the cookie, `{ session }`. Body `{ callsign }`. | - | network-only. |
| `/api/session` | DELETE | clears the cookie, `{ session: null }` | - | network-only. |
| `/api/push/vapid` | GET | `{ publicKey }` | - | network-only. |
| `/api/push/subscriptions` | GET | `{ items: PushSubscriptionInfo[] }` | - | network-only. |
| `/api/push/subscribe`, `/api/push/unsubscribe`, `/api/push/send` | POST | section 9 | - | network-only. |
| `/api/_lab/*` | any | instrument endpoints (section 12). Never chaos'd, never in the request log. | - | Do not call `respondWith`. |
| `/api/_lab/events` | GET | `text/event-stream`, stays open | - | Do not call `respondWith`: a buffered or cached stream breaks the Lab feed. |
| any other `/api/*` | any | 404 JSON `not_found`, never HTML | - | - |

Handbook slugs (the app's "eight chapters"): `arrival-and-handover`, `daily-observations`, `power-and-fuel`, `radio-discipline`, `weather-holds-and-safe-movement`, `medical-and-welfare`, `loss-of-contact-procedures`, `closing-the-season`.

Bench keys: `alpha`, `beta`, `gamma`, `delta`. Every `(strategy, key)` pair has its own counters. `hits` counts server answers: if it did not move between two requests, a cache answered. `payload.sample` is a function of `(key, rev)`, so a bump always changes it.

Seeded data: 64 dispatches `dp-000001`..`dp-000064` (ten of them unread), ten stations (`KRN-07`, `OST-09`, `HLV-02`, `VLD-13`, `GLM-12`, `SKR-11`, `BRD-08`, `TLV-04`, `RVN-01`, `ULG-06`). Server state is in memory; a restart or `POST /api/_lab/reset` reseeds it.

All GET routes also answer HEAD. Conditional requests: `If-None-Match` is honoured (weak comparison, `*` matches) on every route that sends an ETag, with a 304 and no body. Static files also honour `If-Modified-Since`, but only when `If-None-Match` is absent. `Range` is ignored; the answer is always the full body.

### 1.2 Navigation traps

- **Accept decides.** The server answers a navigation with `index.html` only when the request has `Accept: text/html`; the exceptions are `/` and `/index.html`, which are served as files. A worker that calls `fetch('/offline')` or `cache.add('/offline')` sends `Accept: */*` and gets `404 text/plain`. Verified: `/offline`, `/lab/worker` and `/handbook/<slug>` return 404 without that header and 200 with it. `/` and `/index.html` work with any Accept. Precache with `/index.html` (or `/`), or pass `{ headers: { Accept: 'text/html' } }`.
- **The URL, not the bytes, picks the screen.** Every navigation returns identical HTML. If the worker answers a navigation to `/stations` with the cached copy of `/offline`, the router still renders Stations, because it reads `location`. To land on the offline screen, redirect the navigation to `/offline`. Otherwise let the page render its own failure states; most screens already do.
- **Stale shell, missing chunks.** The production `index.html` names hashed entry files; every page is a lazy chunk with its own hashed name. Each `npm run build` produces new names (the build id is baked into code) and deletes the old ones from `dist/`. A cached `index.html` that points at deleted files produces `chunk-load` errors (section 5). The build emits no asset manifest, so a worker that wants to precache the shell must read the names from `index.html` or cache `/assets/*` at runtime.
- **No tab id.** `<img>` requests for `/media/*`, script, style and font requests under `/assets/*`, and navigations carry no `X-Tab-Id` (section 3).

### 1.3 Never cache, and why

| URL | Why |
|---|---|
| `/api/signal` | Live board. `seq` grows per request; the page flags a response that looks cached. `no-store` under every profile. |
| `/api/session` | Login state. A stored `{ session: null }` shows a signed-in operator as signed out, and the reverse after expiry. `no-store`. |
| `/api/ping` | The reachability probe (`HEAD`). A stored 204 turns "unreachable" into "reachable". The page also treats a response with `X-SW-Source: cache\|fallback\|cache-miss`, or a 200 HTML body, as unreachable (section 2). `no-store`. |
| `/api/version`, `/version.json` | The deploy watcher and the forced-upgrade gate. A stored copy hides a new deploy and a raised `minClient` from every open tab. The page fetches both with `cache: 'no-store'`, but a worker still sees them. |
| `/api/_lab/*` | Instruments. Includes the server-sent event stream. `no-store`. |
| `/api/bench/network-only/*` | The point of that strategy. `no-store` under every profile. |
| `/api/push/*` | The VAPID key is bound to subscriptions (section 9); a stored key outlives a regenerated one. Subscriptions list and sends reflect live server state. |
| Every non-GET | `cache.put` rejects non-GET requests anyway. Queue the one write that has an outbox (section 7); let the rest fail. |
| `/sw.js` | The browser fetches the worker script itself; the top-level script request does not reach your `fetch` handler. Do not put it in a cache of your own either. |

Responses to refuse even on routes you do cache (all of these can be produced on purpose from Lab → Chaos):

| Response | Why | Chaos rule that makes it |
|---|---|---|
| status other than 200 | `cache.put` stores any status. Error bodies are `no-store` from the server, but nothing stops a worker storing them. | Flaky API, Stale chunks, Rate limited |
| 200 with `Content-Type` not JSON on an `/api` URL | a captive portal; it would be served as the feed | Captive portal |
| 200 with an empty body | | Empty 200 |
| 200 JSON that does not parse | | Corrupt JSON |
| a body shorter than `Content-Length` | `fetch` resolves on headers; the body fails later | Truncated feed |
| a response carrying `X-Chaos` | the lab touched it (latency or a fault). Useful as a test rule, not a production one. | any |
| a body that fails `Dispatch`/`DispatchPage` validation | schema drift: the cache outlives the deploy | Schema drift |

### 1.4 What the app looks up in Cache Storage

The app never writes to Cache Storage. It reads, with `caches.match(url)` over every cache (no `cacheName`), so any cache name works. Entries are keyed by URL; the server sends no `Vary`, so request headers do not affect a match.

| Reader | URL looked up | Options | Shows |
|---|---|---|---|
| Handbook list, chapter page, `/offline` | `/api/handbook/<slug>` for each chapter in the index | defaults (`ignoreVary: false`) | "stored on this device" |
| Lab → Bench "Precached?" | `/api/bench/cache-only/alpha`, `beta`, `gamma`, `delta` | defaults | precached yes / no |
| Lab → Caches "Precheck" | `/api/bench/cache-only/alpha\|beta\|gamma`, `/api/handbook`, `/api/handbook/<slug>` for each slug in a cached index, `/offline`, `/`, and any entry under `/assets/` | defaults | HIT or MISS |
| Lab → Consistency | `/api/inbox/summary`, `/api/dispatches` (matched under any query string), `/api/dispatches/<id>` per visible row | `ignoreSearch` on the feed only | the storage layer's reading. If no `/api/dispatches/<id>` entry exists it reads the item out of the cached feed page. |

Consequences: store a handbook chapter under a different key (a query string, a trailing slash, an absolute URL on another origin) and the badge says "not stored". Store a JSON body that fails the schema and Consistency reports the copy unreadable, not stale.

---

## 2. Response headers

### 2.1 Set by the server

| Header | On | Value | Used by |
|---|---|---|---|
| `X-Request-Id` | every response | `r-` + 7 base36 characters. Also in the error body as `requestId`. | joins the page's request log to the server's (Lab → Network) |
| `X-Served-At` | every response | ISO time the answer was produced. With chaos latency it is re-stamped after the delay. | data age, the STALE flag, "from N min ago" (below) |
| `X-Served-By` | every response | `outpost/<serverInstance>`; the instance id changes on every server start | the reachability probe (below) |
| `X-Api-Version` | every response | `store.release.api`, default `1` | `api-mismatch` skew when it differs from the client's `API_VERSION` (1) |
| `X-Resource-Rev` | dispatch list (feedRev), dispatch (rev), station (rev), inbox summary (feedRev), digest (feedRev), bench (rev), POST/PATCH dispatch | integer | shown in the provenance chip |
| `X-Chaos` | a response a chaos rule slowed or broke | the rule's label (ASCII, 120 chars max) or `server-offline` | `AppError.context.chaos`, the chaos banner |
| `ETag` | see 3.4 | weak, `W/"..."` | conditional requests |
| `Idempotent-Replay` | `POST /api/dispatches` on a replayed key | `true` | request log note `idempotent-replay` |
| `Location` | 201 from `POST /api/dispatches` | `/api/dispatches/<id>` | - |
| `Retry-After` | chaos `rate-limit` | seconds | `AppError.context.retryAfterSec` |
| `Cache-Control` | every response | section 4 | - |
| `Last-Modified`, `X-Content-Type-Options: nosniff` | files from `dist/` | | - |
| `Access-Control-Expose-Headers` | every response | the custom headers above plus `X-SW-Source`, `ETag`, `Location`, `Retry-After`, `Cache-Control` | no effect same-origin |

Not set: `Vary`, `Content-Encoding`, `Set-Cookie` (except the session routes), CORS allow headers.

### 2.2 Optional, set by your worker: `X-SW-*`

The app reads these from any response it fetches. All four are optional; the app works without them and falls back to timing heuristics. Add them to the `Response` your worker returns (copy the original headers into a new `Headers`, then set these).

| Header | Value | What it changes |
|---|---|---|
| `X-SW-Source` | `cache`, `network`, `revalidated`, `fallback`, `cache-miss` | Decides the response source in the provenance chip and the freshness notes. `cache` -> `sw-cache` ("stored copy"). `network` or `revalidated` -> `sw-network` (counts as proof the server is up). `fallback` or `cache-miss` -> `sw-fallback`. Any other value is ignored and noted as "unrecognised" in the chip. |
| `X-SW-Strategy` | free text, e.g. `stale-while-revalidate` | shown in the chip's detail only |
| `X-SW-Cache` | cache name, e.g. `api-v3` | shown in the chip's detail only |
| `X-SW-Cached-At` | ISO time the entry was written | the "age of the data" for stored copies (below) |

How the page decides where a response came from (`src/lib/api/provenance.ts`), strongest evidence first:

1. `X-SW-Source` as above.
2. Resource timing: `deliveryType === 'cache'`, or `transferSize === 0` with a non-empty body. With a controlling worker this reads `sw-cache`; without one, `http-cache`.
3. Otherwise `network`.

A worker that answers from Cache Storage without the header still reads as `sw-cache` through rule 2 in Chromium. One that streams from the network without the header reads as `network`. Nothing can prove a negative.

Which clock each screen uses for "how old is this":

| Screen | Order |
|---|---|
| Dispatch feed and detail (`features/dispatches/freshness.ts`) | `X-SW-Cached-At`, then `X-Served-At`, then arrival time |
| Stations (`features/stations/freshness.ts`) | `X-Served-At`, then `X-SW-Cached-At`, then arrival time |
| Compose station picker | `X-SW-Cached-At`, then `X-Served-At`, then arrival time |
| Lab → Consistency, storage layer | `X-Served-At`, then `X-SW-Cached-At` of the stored response |

So when you rebuild a `Response`, keep the original `X-Served-At`: a stored copy then keeps its true age. Replace it with a fresh value and every cached copy looks new.

A 304 revalidation done by the browser's HTTP cache reads `source: http-cache`; the chip relabels it "HTTP cache 304" when `transferSize > 0`. Whether a screen calls the data a "stored copy" depends on the source and the age. Dispatch screens: `sw-cache` and `sw-fallback` always; `http-cache` only when `X-Served-At` is more than 10 s old (or missing). Stations: `sw-cache` and `http-cache` only when the data is more than 5 s old (or its age is unknown); `sw-fallback` is shown as a made-up answer. A cached copy with a fresh `X-Served-At` therefore does not look stored.

The reachability probe (`HEAD /api/ping`, `cache: 'no-store'`, 3 s timeout) counts a response as "the server answered" only if it carries `X-Served-By`, its `X-SW-Source` is not `cache`, `fallback` or `cache-miss`, and it is not a 2xx whose `Content-Type` contains `html`. Any status counts otherwise, a 503 included. A worker that fabricates its own offline answer for `/api/ping` therefore reads as "unreachable", which is correct.

---

## 3. Request headers

### 3.1 Sent by the page

| Header | Sent on | Value | Server use |
|---|---|---|---|
| `X-Tab-Id` | every `apiFetch` call (data, `/version.json`, lab calls) and `HEAD /api/ping`. Not on navigations, `<img>`, scripts, styles, fonts, `EventSource`, manifest probes. | `tab-` + 8 hex characters, kept in `sessionStorage`, so a reload keeps it | logged as `tab` in the request log. Lab → Network uses it to tell this tab's requests from requests with no tab id. |
| `Idempotency-Key` | `POST /api/dispatches` only | the dispatch's `clientId`: `crypto.randomUUID()`, or `cid-<base36>-<random>` outside secure contexts | dedupes creation (3.2) |
| `If-Match` | `PATCH /api/dispatches/:id` only | `W/"<id>-r<rev>"`, built from the highest `rev` of that dispatch in the React Query cache. Not copied from an `ETag` header. | optimistic concurrency (3.3) |
| `Accept` | `apiFetch` | `application/json` | none |
| `Content-Type` | requests with a body | `application/json` | `express.json` parses only this type; with any other type the body arrives empty (on `POST /api/dispatches`: a 422 naming the first missing field) |
| credentials | all `apiFetch` calls | `same-origin`: the session cookie goes with every call | section 6 |
| request cache mode `no-store` | `/version.json`, `/api/version`, every lab call, `HEAD /api/ping` | `fetch(..., { cache: 'no-store' })` | not a header the server reads; it tells the HTTP cache to stay out. The worker still sees these requests, with `request.cache === 'no-store'`. |
| `If-None-Match`, `If-Modified-Since` | added by the browser's HTTP cache, not by app code | | 304 handling (3.4) |

A worker that builds its own request (`fetch('/api/x')`, `new Request(url)`) loses `X-Tab-Id`, `Idempotency-Key` and `If-Match`. `fetch(event.request)` keeps them. In Lab → Network a request the worker made on its own shows up as a row with no client-side counterpart.

### 3.2 `Idempotency-Key`

`POST /api/dispatches`, in order:

1. No valid session: 401 `unauthorized`. This check runs before the body is validated, so an empty body with no session is still a 401.
2. The key is `Idempotency-Key` if present and non-blank, otherwise the body's `clientId`. The header wins over the body. The key becomes `clientId` and must be at least 8 characters.
3. Body validated against `DispatchCreate` (422 `validation_failed` with zod issues in `details`). `stationId` must exist (code or id, case-insensitive), else 422.
4. A key seen before: **200**, the original dispatch (the new body is ignored, even if it differs), header `Idempotent-Replay: true`, request-log note `idempotent-replay`. A new key: **201**, `Location`, the new dispatch.

`filedAt` is `filedAtClient` if present and not in the future, otherwise the server's now. `filedBy` is the session's callsign. The key map lives in server memory and is dropped when the dispatch is evicted (cap 1000), on `POST /api/_lab/reset` and on restart.

### 3.3 `If-Match`

Accepted forms: `W/"dp-000002-r2"`, the same without `W/`, `*`, or a comma list. While schema drift is on, the response ETag gains a `-drift` suffix (`W/"dp-000002-r2-drift"`); `If-Match` accepts either spelling for the same revision. A mismatch is 412 `conflict`, with `ETag` and `X-Resource-Rev` of the current version and `details.current` holding the current dispatch. The page then replaces its caches with `details.current`, rolls its optimistic change back and shows "Changed elsewhere". A worker that serves an old dispatch from cache therefore produces 412s on the next star or acknowledge. A patch that changes nothing returns 200 with the same revision.

### 3.4 ETags and 304

| Route | ETag |
|---|---|
| `/api/dispatches/:id` | `W/"<id>-r<rev>"` |
| `/api/stations/:id` | `W/"<id>-r<rev>"` |
| `/api/stations` | hash of `id:rev` pairs |
| `/api/dispatches` | hash of the body |
| `/api/inbox/summary` | hash of the counts and `feedRev` |
| `/api/digest` | hash of the digest content, not `generatedAt` |
| `/api/handbook`, `/api/handbook/:slug` | hash of the body |
| `/media/*` | hash of the SVG |
| files from `dist/` | `W/"<size hex>-<mtime hex>"` plus `Last-Modified` |
| none | `/api/ping`, `/api/session`, `/api/signal`, `/api/version`, `/api/bench/*`, `/api/push/*`, `/api/_lab/*`, `POST /api/inbox/read-all`, and bench `bump` |

The server answers 304 for `If-None-Match` on GET and HEAD, with weak comparison, and does not use Express' `req.fresh`: `fetch()` adds `Cache-Control: no-cache` to any request that carries its own `If-None-Match`, which would make `req.fresh` refuse every revalidation a worker makes. A 304 has no body and repeats the route's `Cache-Control` and `ETag`. Request-log note: `etag-304`.

---

## 4. Cache-header profiles

`GET /api/_lab/state` reports `headerProfile`; `PUT /api/_lab/headers` with `{ "profile": "..." }` changes it, effective for the next response. `POST /api/_lab/reset` returns it to `realistic`. Switch in the UI at Lab → Server → Header profile.

The server sorts each path into a class (`server/static.ts`, `classify`) and picks the `Cache-Control` from class and profile. Measured against a running server:

| Resource class | Paths | `realistic` | `no-store` | `http-cache-trap` |
|---|---|---|---|---|
| document | `/`, any path with no extension, `*.html` | `no-cache` | `no-store` | `max-age=31536000` |
| service worker | `/sw.js` (once it exists) | `no-cache` | `no-store` | `max-age=31536000` |
| manifest | `/manifest.webmanifest` (once it exists) | `no-cache` | `no-store` | `max-age=31536000` |
| version | `/version.json` | `no-cache` | `no-store` | `no-cache` |
| other files | `/favicon.svg`, `/icons/*` | `no-cache` | `no-store` | `no-cache` |
| asset | `/assets/*` | `public, max-age=31536000, immutable` | `no-store` | `public, max-age=31536000, immutable` |
| media | `/media/*` | `public, max-age=86400` | `no-store` | `public, max-age=86400` |
| api | every other `/api/*`, including `/api/push/*`, `/api/version`, bench except network-only | `no-cache` | `no-store` | `max-age=60` |
| volatile | `/api/_lab/*`, `/api/ping`, `/api/session`, `/api/signal`, `/api/bench/network-only/*` | `no-store` | `no-store` | `no-store` |

Rules that hold under every profile:

- Error bodies are `no-store`: every JSON error from the server, every 404 text body, and every injected chaos failure. Under `http-cache-trap` a 503 with `max-age=60` would otherwise outlive the fault.
- Chaos responses that are not errors (captive-portal HTML, empty 200, corrupt JSON) keep the profile's value for their path. The captive-portal page under `realistic` is `no-cache`, which a worker can store.
- A 304 carries the same `Cache-Control` as the 200 it stands in for.
- Writes (`POST`, `PATCH`, `DELETE`) get the value of their path too (`POST /api/dispatches` shows `no-cache`). Browsers do not cache them either way.
- Express' automatic ETags are off. Every validator comes from the route (3.4).

What each profile is for, and what to look at:

| Profile | Teaches | Observe |
|---|---|---|
| `realistic` | the sane default: entry points revalidate, hashed files are immutable, API calls revalidate with ETags | Lab → Network: API repeats are `etag-304`; assets show as cache hits |
| `no-store` | the worker's cache is the only cache. Nothing is stored by the HTTP cache. | a page that works offline now is working because of your worker, nothing else |
| `http-cache-trap` | the "my update never arrives" bug: `index.html`, `sw.js` and the manifest cached for a year, API calls for 60 s | Lab → Worker timeline: whether a new `sw.js` is detected. Lab → Network: a navigation or API repeat with no server row, meaning the HTTP cache answered. After `npm run release`, whether the open tab ever sees the new build. |

Browser behaviour. Observed in Chrome 152 against this server under `http-cache-trap`: with the default `updateViaCache: 'imports'`, `registration.update()` goes to the server for `sw.js` and finds a changed file, so `sw.js` with a year-long `max-age` is not stuck on its own; with `updateViaCache: 'all'` the update check is answered from the HTTP cache and a changed file is never noticed. The rest of this paragraph is standard behaviour that was not checked here. Files pulled in with `importScripts()` or static `import` do go through the HTTP cache by default. A worker's own `fetch()` also goes through the HTTP cache unless you pass a `cache` mode, so under `http-cache-trap` a stale-while-revalidate "revalidation" can be answered from the HTTP cache for 60 s without reaching the server. Check Lab → Network for the missing server row.

---

## 5. Errors

### 5.1 Body

Every JSON error from the server:

```json
{ "error": { "code": "validation_failed", "message": "Invalid dispatch. title: Too small: ...", "requestId": "r-000i3hz", "details": [ ... ] } }
```

`details` is optional: zod issues for 422, `{ current: Dispatch }` for 412, `{ chaosRule: <id> }` for an injected status, `{ retryAfterSec }` for injected 429. `requestId` equals the `X-Request-Id` header. Content type `application/json; charset=utf-8`, `Cache-Control: no-store`. Not JSON: unknown non-API paths and anything under `/assets/` (404 `text/plain`), and the chaos modes that corrupt the body (section 12).

### 5.2 Server code, status, client kind

`apiFetch` (`src/lib/api/client.ts`) turns every failure into an `AppError` with a `kind`. The kind comes from the status (`kindForStatus`), not from `error.code`; the code is copied into `context.code`.

| Status | Server `code` | Who sends it | `AppError.kind` | Retryable |
|---|---|---|---|---|
| 400 | `bad_request` | malformed JSON body, malformed `cursor`; chaos for unlisted 4xx | `validation` | no |
| 401 | `unauthorized` | `POST /api/dispatches`, `PATCH` with `acked`, no live session | `unauthorized` | no |
| 403 | `forbidden` | a write whose `Origin` host differs from `Host` | `forbidden` | no |
| 404 | `not_found` | unknown id, slug, key, endpoint, preset | `not-found` | no |
| 409 | `conflict` | no route emits it; chaos `status` 409 only | `conflict` | no |
| 410 | `gone` | no route emits it; chaos only | `http` | no |
| 412 | `conflict` | `PATCH` with a stale `If-Match`; `details.current` | `conflict` | no |
| 413 | `bad_request` | body over 256 kB | `http` | no |
| 422 | `validation_failed` | schema failure, unknown station, bad query value (`limit` > 50, `since` without a zone), `custom` push without a title | `validation` | no |
| 426 | - | never sent by the server; mapped to `version-skew` | `version-skew` | no |
| 429 | `rate_limited` | chaos `rate-limit` (with `Retry-After`); push: 50 subscriptions stored, 25 delayed pushes pending | `rate-limited` | yes |
| 500, other 5xx | `internal` | unhandled error; chaos `status` | `server` | yes |
| 502, 503, 504 | `unavailable` | chaos `status` only | `unavailable` | yes |
| 504 with `X-SW-Source: cache-miss` | - | your worker | `cache-miss` | yes |

Chaos `status` rules choose `code` from the status: 401 `unauthorized`, 403 `forbidden`, 404 `not_found`, 409 and 412 `conflict`, 410 `gone`, 422 `validation_failed`, 429 `rate_limited`, 502, 503 and 504 `unavailable`, any other 5xx `internal`, any other 4xx `bad_request`. The rule's `status` is 400-599.

Kinds with no HTTP status, all produced by `apiFetch` or the page:

| Kind | When | Retryable |
|---|---|---|
| `offline` | `fetch()` rejected and `navigator.onLine === false` | yes |
| `network` | `fetch()` rejected otherwise (socket dropped, `Response.error()` from a worker), or the body stream failed | yes |
| `timeout` | the app's own timer (lab setting `requestTimeoutMs`, default 10000; 0 = off) | yes |
| `aborted` | the caller cancelled | no |
| `parse` | a 2xx whose body is empty (a 204 only when the caller allows it), whose `Content-Type` is not JSON, whose body is HTML, or whose JSON does not parse | yes |
| `schema-mismatch` | JSON parsed, zod rejected it: a stale cached shape, schema drift | no |
| `version-skew` | the version watcher: running version below `minClient` (the forced-upgrade dialog) | no |
| `chunk-load` | a dynamic `import()` failed: a lazy route offline or after a deploy | yes |

The page does not look at `navigator.onLine` before a request: a worker may answer.

### 5.3 What a worker should answer when it has nothing

| Worker answer | The page sees |
|---|---|
| `Response.error()`, or `respondWith` rejects | `fetch` rejects: `offline` when `navigator.onLine` is false, `network` otherwise |
| 504, `X-SW-Source: cache-miss`, an error body (ideally the shape in 5.1) | `cache-miss` ("Not stored for offline use"). This is the intended answer for a `cache-only` miss. |
| 503 and an error body | `unavailable` |
| 200 `text/html` (the cached shell) for an `/api` URL | `parse` |
| 200 `application/json` and `{}` | `schema-mismatch` |
| a 304 built by hand | non-2xx, so `http` |

---

## 6. Session cookie

| Property | Value |
|---|---|
| Name | `outpost_sid` |
| Attributes | `HttpOnly; SameSite=Lax; Path=/; Max-Age=<ttl>`. No `Secure`, no `Domain`. |
| Value | 24 random bytes, base64url. The server maps it to `{ operator: { callsign, displayName }, issuedAt, expiresAt }`. |
| Lifetime | `Max-Age` equals the session TTL at creation: 600 s by default. Not sliding: nothing refreshes the cookie or the session. |
| Created by | `POST /api/session` `{ callsign }` (2-16 letters, digits or dashes). A new login destroys the old session id. |
| Ended by | `DELETE /api/session` (also clears the cookie), expiry, `POST /api/_lab/session` `{ "action": "expire" }`, `POST /api/_lab/reset`, a server restart |
| Read by | `GET /api/session` -> `{ session: Session \| null }`, always 200. An unknown or expired cookie is "signed out", not an error. |

An expired session leaves the cookie in the browser (until its own `Max-Age` passes). The next write that needs a session is a 401.

What needs a session: `POST /api/dispatches`, and `PATCH /api/dispatches/:id` when the body contains `acked`. Everything else, including every push and lab endpoint, is open. Order of checks: a dispatch POST with no session is 401 even when the body is empty; a PATCH validates its body first (an empty patch is 422) and then asks for the session only if `acked` is present. `read` and `starred` patches work signed out.

Why it matters for the worker:

- **Caching.** No GET response depends on who is signed in, so feed and detail copies stay valid across sign-in and sign-out. `/api/session` is the one auth-dependent GET: never store it (1.3). `GET /api/_lab/truth` echoes the calling session, but it is a lab route.
- **Requests from the worker carry the cookie.** `fetch()` defaults to same-origin credentials, so a worker's request to `/api/dispatches` sends `outpost_sid` like a page's would. Page JavaScript cannot read the cookie (`HttpOnly`), and neither can your worker: the only way to know whether a session is alive is `GET /api/session`.
- **Background Sync replays outlive the session.** A replay may run minutes or hours after the page queued the item; the default TTL is ten minutes. Expect 401 on replay as the normal case, not the exception (section 7). A worker cannot prompt for a login; it can only leave the item queued, mark it, and tell open pages.
- **The 'ack' notification action** is a `PATCH` with `acked`; it needs the cookie too.
- **Tab sync.** Sign-in and sign-out broadcast `session-changed` between tabs on the `outpost-tabs` channel. That is page-to-page; the worker is not involved.

---

## 7. Background Sync

### 7.1 Names

From `shared/sw-protocol.ts`. They are suggestions: the page reads the outbox only through `sync.listQueued`, so another database name works as long as your seam and your worker agree.

| Name | Value |
|---|---|
| Sync tag | `outbox-flush` (`SYNC_TAG_OUTBOX`) |
| IndexedDB database | `outpost-outbox` (`OUTBOX_DB`) |
| Object store | `outbox`, `keyPath: 'id'` (`OUTBOX_STORE`) |
| Broadcast channel | `outpost-sw` (`SW_BROADCAST_CHANNEL`) |

Already taken by the app: IndexedDB `outpost-query` (store `cache`, the React Query persister), BroadcastChannel `outpost-tabs`, `localStorage` keys starting `outpost.`. The app creates no Cache Storage caches. The page and the worker both open the outbox database, so decide in one place who runs `onupgradeneeded`, and keep the version number identical in both.

### 7.2 When the page queues

`useSubmitDispatch` (`src/features/compose/submit/useSubmitDispatch.ts`):

1. `POST /api/dispatches` with the form's `clientId` as `Idempotency-Key`. For `timeout`, `unavailable`, `server` and `rate-limited` errors the mutation first retries up to the lab setting `retries` (default 2), with the same key.
2. If the final error kind is `network`, `offline`, `timeout`, `unavailable` or `server`, the page marks the draft `offline-failed` and calls `sync.queueDispatch(input)` (src/pwa/sync.ts).
3. Other kinds are not queued: `validation` (shown on the form), `unauthorized` (opens the clock-in dialog and re-sends after sign-in), `rate-limited` (countdown from `Retry-After`).
4. If `queueDispatch` resolves: draft marked `queued`, toast "Queued", navigate to `/drafts`. If it throws `not-implemented`: the dispatch stays a local draft and the form shows a "Not sent" notice. Any other error: shown as a queue failure ("Not sent. Kept on this device." plus the error).

`input` is the validated `DispatchCreate`, with defaults applied. Only dispatch creation has an outbox.

### 7.3 The record

`OutboxItem` (`shared/sw-protocol.ts`). The page validates what `listQueued()` returns with this schema; a record that does not match is an error in the Outbox panel.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | equals `payload.clientId` and is the `Idempotency-Key` |
| `createdAt` | ISO datetime | when it was queued |
| `attempts` | integer | replay attempts so far |
| `status` | `queued` \| `sending` \| `failed` | the Outbox panel shows exactly these three words |
| `lastError` | string or null | shown as "Last error: ..." |
| `payload` | `DispatchCreate` | below |

`payload` (`DispatchCreate`):

| Field | Rule |
|---|---|
| `clientId` | string, 8+ characters |
| `stationId` | string; a station id (`st-krn07`) or code (`KRN-07`) |
| `title` | 3-120 characters |
| `body` | 1-4000 characters |
| `severity` | `routine`, `notice`, `urgent`, `critical` |
| `tags` | up to 8 strings of up to 24 characters; defaults to `[]` |
| `coords` | `{ lat, lng }` or `null`; defaults to `null` |
| `filedAtClient` | ISO datetime, optional; the moment the operator pressed the button (it survives hours of queueing) |

Keep `usePwaStore.queuedCount` equal to the number of records (`setPwa({ queuedCount })`). The nav pill and the Drafts page read it, and the page re-reads `listQueued()` when it changes, when the window regains focus and after every `sync-complete`.

### 7.4 The replay request

| Part | Requirement |
|---|---|
| Request | `POST /api/dispatches` |
| `Content-Type` | `application/json`. Without it the body is not parsed; with the `Idempotency-Key` header present the answer is a 422 about `stationId`. |
| `Idempotency-Key` | the item's `id`. If omitted the body's `clientId` is used, which must be 8+ characters. |
| Cookie | sent automatically; needs a live session (section 6) |
| Body | `JSON.stringify(item.payload)` |
| `X-Tab-Id` | not sent from a worker; the server logs `tab: null` |

### 7.5 What to do with the answer

| Answer | Meaning | Outbox action |
|---|---|---|
| 201, JSON dispatch | created | delete the record; report the id in `succeeded` |
| 200, `Idempotent-Replay: true` | the server already has it (an earlier attempt got through but its answer was lost) | delete; `succeeded`. The app's own toast calls this "Already filed". |
| 401 `unauthorized` | the session expired | keep. Backing off does not help: it needs a person. Set `status: 'failed'` or leave `queued`, `lastError` explaining, report the id in `failed`. |
| 422 `validation_failed`, 400 `bad_request` | the payload will never be accepted (unknown station, over-long text) | do not retry. Mark `failed` with the message, or drop it. Dropping loses the operator's text; marking keeps it visible. |
| 429 `rate_limited` | back off | keep; wait at least `Retry-After` seconds |
| 500, 502, 503, 504 | server fault | keep; retry with backoff |
| `fetch` rejects (dropped socket, offline) | no answer; the write may or may not have happened | keep; retry. The key makes a retry safe whether or not it did. |
| 200 or 201 whose body is HTML, empty or not JSON | not a success. Under Chaos the real handler never ran for these modes, so nothing was filed. | keep; retry |
| 403 `forbidden` | cross-origin `Origin` header; not expected from a same-origin worker | treat as permanent |
| 409 | this server never sends it for a create (a replay is 200) | - |

Treat a 2xx as success only after checking the status (200 with `Idempotent-Replay`, or 201) and that the body parses as JSON.

Resolving the `sync` event: `event.waitUntil(promise)`. A rejected promise makes the browser reschedule the sync with its own backoff; `event.lastChance` says it is the final try. When done, post `sync-complete` (section 10) with the ids that succeeded and the ids still waiting.

### 7.6 Without SyncManager

Safari and Firefox have no Background Sync. `queueDispatch` should still store the item; `flushNow()` is wired to "Retry all" in Drafts and is the only replay path there.

### 7.7 Testing

| Goal | How |
|---|---|
| Fail a write | Lab → Chaos: preset Dropped writes (half of POSTs lose the socket), or Hard down. Or DevTools → Network → Offline. |
| Trigger the sync | DevTools → Application → Service Workers → Sync, tag `outbox-flush` |
| See what was queued | Lab → Queue → Outbox (reads `sync.listQueued`) |
| See the replay | Lab → Network: a POST row with no client row and note `idempotent-replay` if the first attempt had got through |
| Count what the server holds | `GET /api/_lab/truth` -> `inbox.total`, or `curl $B/api/dispatches?limit=1` and read `total` |
| Expire the session | Lab → Server → Session control, or `POST /api/_lab/session {"action":"expire"}`; the replay answers 401 |
| Replay the same key by hand | curl in section 12.5 |

---

## 8. Periodic Sync

| Item | Value |
|---|---|
| Tag | `digest-refresh` (`PERIODIC_TAG_DIGEST`) |
| Requested interval | the Settings → Background refresh card offers 15 minutes (900000 ms), one hour (3600000), twelve hours (43200000) |
| Seam | `periodicSync.register(tag, minIntervalMs)`, `unregister(tag)`, `list()`, `isSupported()` (answers early) |
| Browser | Chromium only, and for an installed app. The browser picks the real timing from engagement; expect hours. Permission name: `periodic-background-sync` (query `navigator.permissions` first). |
| Trigger without waiting | DevTools → Application → Service Workers → Periodic Sync, tag `digest-refresh` |

Keep `usePwaStore.periodicTags` equal to the registered tags; Settings reads it.

### 8.1 `GET /api/digest?since=<iso>`

| Parameter | Rule |
|---|---|
| `since` | ISO 8601 datetime with `Z` or a numeric offset (`2026-10-06T04:00:00Z`, `...T04:00:00+02:00`). No zone: 422. Empty or absent: the last 24 hours. A future time gives an empty digest. |

Response `Digest`:

| Field | Value |
|---|---|
| `generatedAt` | server now. Store it and send it as the next `since`. |
| `since` | the effective `since` as UTC ISO, or `null` when none was sent |
| `newCount` | dispatches with `filedAt` strictly after `since`. Not capped. |
| `urgentCount` | how many of those are `urgent` or `critical` |
| `unread` | unread dispatches in the whole log, whatever `since` was. This is the number the badge should show; it equals `InboxSummary.unread`. |
| `items` | those dispatches, newest first, at most 20. `newCount` can exceed `items.length`. Shaped like `GET /api/dispatches` items (drifted fields while schema drift is on). |

Headers as 3.4: ETag over the content (not `generatedAt`), `X-Resource-Rev` = `feedRev`. The URL varies with `since`, so a cached digest needs `ignoreSearch` to be found by `caches.match('/api/digest')`.

### 8.2 What the page does with the result

`periodic-sync-complete` `{ tag, newCount }` invalidates every query whose `meta.url` is `/api/digest` or `/api/inbox/summary` (or sits under them), so the inbox count refetches. No screen renders the digest query today, so the visible effect is the inbox count and the badge. Nothing else in the app calls `/api/digest`.

### 8.3 Making something to fetch

Lab → Server → Wire simulator, or the curls in 12.5. The wire generator draws from 45 templates (16 routine, 15 notice, 9 urgent, 5 critical) with a seeded generator: after a reset it yields the same titles in the same order. Each spawned dispatch has `filedAt` = now, a `filedBy` callsign from a fixed list, `clientId: null`, `read: false`, and the template's severity unless `severity` is passed. Ids continue one counter (`dp-000065` on a fresh server) that a reset does not rewind, so new ids are never reused. `auto` files one every `everySec` (2-3600). `pushOnNew` sends a push for every new dispatch, whether the wire or `POST /api/dispatches` made it (section 9).

---

## 9. Push

### 9.1 Endpoints

| Endpoint | Request | Response |
|---|---|---|
| `GET /api/push/vapid` | - | `{ publicKey }`: the VAPID public key, base64url, 65-byte uncompressed P-256 point (87 characters). Generated on first boot and persisted in `server/.data/vapid.json` (`OUTPOST_DATA_DIR` moves it). Use it as `applicationServerKey`. |
| `POST /api/push/subscribe` | `{ subscription: PushSubscriptionJSON, label? (max 60) }` | 201 `PushSubscriptionInfo` for a new endpoint, 200 when the endpoint is already stored (keys and label refresh). 422 if the endpoint is not `https`. 429 beyond 50 stored subscriptions. |
| `POST /api/push/unsubscribe` | `{ endpoint? }` or `{ id? }` (one required) | `{ removed: boolean }`. Idempotent. |
| `GET /api/push/subscriptions` | - | `{ items: PushSubscriptionInfo[] }` |
| `POST /api/push/send` | `PushSendRequest` below | `PushSendResult` |

Subscription body, as `pushSubscription.toJSON()` produces it:

```json
{ "subscription": { "endpoint": "https://fcm.googleapis.com/fcm/send/...", "expirationTime": null, "keys": { "p256dh": "...", "auth": "..." } }, "label": "Desk Chrome" }
```

`PushSubscriptionInfo`: `id` (`ps-` + first 10 hex of sha256 of the endpoint), `endpointHost`, `endpointTail` (last 12 characters, used to target one subscription), `label`, `createdAt`, `lastResult` (`never`, `ok`, `failed`). Subscriptions persist in `server/.data/subscriptions.json` across restarts and resets. A subscription is bound to the VAPID key it was made with; if `vapid.json` is lost and regenerated, stored subscriptions are dropped. The server prunes a subscription when the push service answers 404 or 410. Push endpoints are unauthenticated and accept any https endpoint: a local learning app only.

### 9.2 `PushSendRequest`

| Field | Rule |
|---|---|
| `kind` | `dispatch`, `custom`, `silent-badge`, `sync-poke`; default `custom` |
| `title` | up to 120 characters. Required for `custom`. |
| `body` | up to 400 characters |
| `url` | where a click should go |
| `tag` | notification tag |
| `dispatchId` | required for `dispatch` (404 if unknown). Also fills `payload.dispatchId` for other kinds. |
| `badgeCount` | omitted: the current unread count. `null`: leave the badge alone. A number: that count. |
| `actions` | up to two `{ action, title }` |
| `requireInteraction` | boolean |
| `ttl` | 0-86400 s; default 3600 |
| `urgency` | `very-low`, `low`, `normal`, `high`; default `normal` |
| `delaySec` | 0-300. The response comes back at once with `scheduledInSec`; the payload and targets are resolved again when it fires. At most 25 delayed pushes pending (429 beyond). |
| `targetEndpointTail` | send to the one subscription ending in this (404 if none) |

`PushSendResult`: `{ attempted, delivered, failed, pruned, scheduledInSec, payload, results[{ id, ok, statusCode?, error? }] }`. `payload` is returned even with no subscriptions. The send waits for the push service (10 s timeout per subscription).

### 9.3 `PushPayload` as received

`event.data.json()` in the `push` handler. All fields are always present.

| Field | Type | Notes |
|---|---|---|
| `v` | `1` | |
| `kind` | `dispatch` \| `custom` \| `silent-badge` \| `sync-poke` | |
| `title` | string | |
| `body` | string | |
| `url` | string | in-app path, e.g. `/log/dp-000064` |
| `tag` | string or null | |
| `dispatchId` | string or null | |
| `badgeCount` | integer or null | null: do not touch the badge |
| `icon` | string | always `/icons/icon-192.png` |
| `image` | string or null | always null (the art is SVG, which notifications do not render) |
| `actions` | `{ action, title }[]` | at most two |
| `requireInteraction` | boolean | |
| `silent` | boolean | true for `silent-badge` and `sync-poke` |
| `sentAt` | ISO datetime | |

A real payload (kind `dispatch`, from `POST /api/push/send {"kind":"dispatch","dispatchId":"dp-000064"}`):

```json
{"v":1,"kind":"dispatch","dispatchId":"dp-000064","badgeCount":10,"icon":"/icons/icon-192.png","image":null,"silent":false,"sentAt":"2026-10-06T06:36:25.012Z","title":"TLV-04: Link dropped for 11 minutes in gusts","body":"Feeder SWR jumped to 2.4 in gusts over 14 m/s and ... Connector tape looks...","url":"/log/dp-000064","tag":"dispatch-dp-000064","actions":[{"action":"open","title":"Open"},{"action":"ack","title":"Acknowledge"}],"requireInteraction":false}
```

### 9.4 Kinds

| Kind | What the server fills in | What the worker is expected to do |
|---|---|---|
| `dispatch` | `title` = `<stationCode>: <dispatch title>`; `body` = the first 140 characters of the dispatch body cut at a word boundary, `...` appended when cut; `url` = `/log/<id>`; `tag` = `dispatch-<id>`; `actions` = `open` / `ack`; `requireInteraction` = true only for a `critical` dispatch. Each can be overridden in the request. | `showNotification` with these fields. Apply `badgeCount` with `setAppBadge` unless null. In `notificationclick`, open `url`. If a window is focused you may send `push-received` to it instead of a system notification. |
| `custom` | whatever you sent; `url` defaults to `/log`; `body` to `""`; `tag` to null | show it exactly as sent. A `tag` replaces an earlier notification with the same tag. |
| `silent-badge` | `silent: true`, `title` "Badge update", `url` `/inbox`, no actions | do not call `showNotification`. `setAppBadge(badgeCount)`, or `clearAppBadge()` at 0. Chromium requires a visible notification per push for a `userVisibleOnly` subscription; a handler that shows nothing gets the browser's generic "updated in the background" one. That is the lesson of this kind. |
| `sync-poke` | `silent: true`, `url` `/log` | no notification. Treat it as a reason to fetch: replay the outbox, refresh `/api/digest`, update caches. Then post `sync-complete` or `periodic-sync-complete`. Same `userVisibleOnly` caveat. |

`requireInteraction` is honoured by desktop Chrome and ignored on Android. Chrome shows at most two actions.

### 9.5 `notificationclick`

Conventions the app and the Lab console assume:

- Read `event.action`: `""` is a click on the body; otherwise it is the action id (`open`, `ack`, or whatever was sent).
- Put the target in the notification's `data` when you show it (`data: { url: payload.url }`) and read it back in the click handler.
- Close the notification (`event.notification.close()`).
- To open `payload.url`: `clients.matchAll({ type: 'window', includeUncontrolled: true })`, `focus()` a window, then `postMessage({ type: 'navigate', url })` (section 10); or `clients.openWindow(url)` when none is open.
- `open`: navigate to the url. `ack`: `PATCH /api/dispatches/<dispatchId>` with `{ "acked": true }`, which needs a live session (section 6); on 401, open the app instead. The page treats the `navigate` target as same-origin only.
- Wrap the work in `event.waitUntil()`.

### 9.6 Testing

Lab → Server → Push console sends the six presets (new dispatch, custom, silent badge, sync poke, long-running, with actions) and lists subscriptions. Lab → Server → Wire simulator with `pushOnNew` on sends a `dispatch` push for every new dispatch. The curls in 12.5 do the same without the UI.

---

## 10. Page and worker messages

The page side is implemented in `src/lib/bridge/sw-messages.ts`. It listens on `navigator.serviceWorker` (`message` and `messageerror`) and on the `outpost-sw` BroadcastChannel, validates each message with `SwToPage`, reacts, and records every message, valid or not, in Lab → Worker → Message log. Unknown types and malformed fields are kept as invalid and otherwise ignored, so you may add messages of your own. `container.startMessages()` is called, so messages posted before the page attached its listener are delivered. Send on one channel or both; both reach the same handler (and both are logged, so sending on both shows twice).

### 10.1 Worker to page (`SwToPage`)

| `type` | Fields | What the page does | Test it |
|---|---|---|---|
| `cache-updated` | `url`, `strategy?`, `cacheName?` | Invalidates every query whose `meta.url` matches `url` by pathname: equal, or `url` is a prefix on a path-segment boundary. Query strings are ignored. `/` matches only itself. So `/api/stations` also invalidates `/api/stations/KRN-07`; `/api/dispatches/dp-000064` invalidates only that detail, not the feed. The note says how many queries were hit. | Queue → Protocol tester, template `cache-updated` |
| `sync-complete` | `tag`, `succeeded: string[]`, `failed: string[]` | Invalidates queries under `/api/dispatches` and `/api/inbox/summary`, re-reads the outbox through `sync.listQueued` and sets `queuedCount`. If either array is non-empty: toast "Outbox sent" (ok) when nothing failed, otherwise "Outbox partly sent" (warn) with "N filed, M still waiting". The ids are outbox ids. | template `sync-complete` |
| `periodic-sync-complete` | `tag`, `newCount` | Invalidates `/api/digest` and `/api/inbox/summary` queries. No toast. | template `periodic-sync-complete` |
| `navigate` | `url` | Routes this tab to `url`, only if it is same-origin; keeps path, search and hash; leading slashes are collapsed to one. Otherwise logs "navigation ignored: ... is not a same-origin URL". | template `navigate`; change the url to `https://example.com/` to see the refusal |
| `push-received` | `payload` (`PushPayload`) | Invalidates `/api/inbox/summary` queries. A toast with title and body and an Open action (to `payload.url`, if same-origin), unless `payload.silent`. | template `push-received` |
| `sw-version` | `version`, `caches?: string[]` | Logged only. The reply to `get-version`; worth sending on activate. | template `sw-version` |
| `log` | `level` (`debug`, `info`, `warn`, `error`; default `info`), `message` | Logged only. | template `log` |

Lab → Queue → Protocol tester sends a message into the page's own bridge as if a worker had: as a `message` event on `navigator.serviceWorker`, as a post on the BroadcastChannel, or automatically. It has one template per type plus an invalid one, an editable JSON box that says whether the message validates, and a panel that lists what the app did (queries invalidated, toasts raised). Use it to check the page half before and after the worker half exists.

### 10.2 Page to worker (`PageToSw`)

The page posts to `navigator.serviceWorker.controller`. With no controller (hard reload, not registered, no support) `sendToSw` returns `false` and the log says "not sent: no controlling service worker".

| `type` | Fields | Expected of the worker | Sent from |
|---|---|---|---|
| `skip-waiting` | - | `self.skipWaiting()` | Lab → Worker → Actions. The update toast calls `registration.applyUpdate()`, which is yours to write. |
| `get-version` | - | reply `{ type: 'sw-version', version, caches? }` | Lab → Worker → Actions |
| `clear-caches` | `prefix?` | delete the caches you own, or those starting with `prefix` | Lab → Worker → Actions (asks for confirmation; sends no prefix) |
| `prefetch` | `urls: string[]` | fetch and store each URL | no button sends it; from DevTools: `navigator.serviceWorker.controller.postMessage({ type: 'prefetch', urls: ['/api/handbook'] })` |
| `ping` | `nonce` | reply so a round trip can be timed; the contract does not fix the reply type | Lab → Worker → Actions |

Replies appear in Lab → Worker → Message log, with direction and channel. The worker receives messages in a `message` event on `self`; reply with `event.source.postMessage(...)`.

---

## 11. Manifest

Nothing exists yet: no `public/manifest.webmanifest`, no `<link rel="manifest">`, no `apple-touch-icon` link. `index.html` carries the two links inside a comment as hints. Files in `public/` are copied to the site root by `vite build` (and served at the root by `npm run dev`), so `public/manifest.webmanifest` is served at `/manifest.webmanifest` with MIME `application/manifest+json` and `public/sw.js` at `/sw.js`. After adding either, rebuild (`npx vite build` while the server runs; `npm run pwa` does a full build and then starts the server).

Lab → Environment → "Manifest and installability" finds `<link rel="manifest">`, fetches it with `cache: 'no-store'`, and runs a checklist (below). It also reports an HTML response (the SPA fallback answering for a missing file) as such.

### 11.1 Routes for manifest members

| Member | Target | Query parameters | What the page does |
|---|---|---|---|
| shortcut: file a dispatch | `/file` | optional `title`, `text`, `url`, `station`, `draft` (below) | the compose form |
| shortcut: inbox | `/inbox` | none | unread triage |
| shortcut: signal | `/signal` | none | live board |
| `start_url` | `/log` is the real landing screen; `/` is served too and redirects client-side to `/log` | none | |
| `scope` | `/` | | contains every route including `/lab/*` and `/offline` |
| `share_target.action` | `/share-target` | `title`, `text`, `url` (method GET) | below |
| `protocol_handlers[].url` | `/handle?uri=%s` | `uri` | below |

`/log` also accepts filters in the query string (`severity`, `station`, `q`, `unread=1`, `starred=1`); a shortcut could use them (`/log?unread=1`).

`/file` prefill (`features/compose/form/prefill.ts`). Everything is cut to length, stripped of control characters, and only `http(s)` links survive:

| Parameter | Used as |
|---|---|
| `title` | dispatch title, cut to 120 characters |
| `text` | body |
| `url` | appended to the body on its own line (unless the text already contains it); also the fallback title as `Link: <host>` |
| `station` | station code or id (2-24 letters, digits, dashes); ignored if not on the list |
| `draft` | an existing local draft id (`[A-Za-z0-9-]`, up to 64) |

If no `title` is given the title is the first non-empty line of `text`, then `Link: <host>`. The body is cut at 4000 characters.

### 11.2 Share target

Declare `share_target` with `action: "/share-target"`, method GET and `params: { title, text, url }` mapped to those same names. The browser then opens `/share-target?title=...&text=...&url=...`.

`/share-target` (`ShareTargetPage`) reads those three parameters, cleans them, and shows what arrived with two actions: "Create dispatch from this" (goes to `/file?title&text&url`) and "Discard" (goes to `/log`). It never files anything and never redirects by itself. Title is cut to 120 characters, text to 4000, and the amounts dropped are reported. `url` is kept only if it is `http` or `https`; otherwise it is dropped with a notice. If `url` is empty and the text contains a link (Android share sheets do this), the link is mentioned and stays in the text. Opened with no parameters it shows an empty state with a sample share link.

A POST target is only needed for files. `POST /share-target` on this server is `404 text/plain`: the server has no route for it, so a worker must intercept the POST in `fetch`, keep the data, and redirect to `/share-target?...` (the page reads only GET parameters). The Lab checklist warns about POST for this reason.

Outgoing sharing is the other direction: the Share button calls `share.canShare` and `share.share` with `{ title?, text?, url?, files? }`; outcomes `shared`, `cancelled`, `unsupported`; any outcome but `shared` falls back to copying the link.

### 11.3 Protocol handler

Declare `protocol_handlers: [{ protocol: "web+outpost", url: "/handle?uri=%s" }]`. The browser substitutes the clicked link, percent-encoded once, for `%s`.

`/handle` (`HandlePage`, `features/compose/handle/handle-uri.ts`) accepts only these forms, case-insensitive on the scheme and resource name, up to 200 characters, a trailing `/` allowed, no query or fragment:

| URI | Opens | Identifier rule |
|---|---|---|
| `web+outpost://dispatch/<id>` | `/log/<id>` (lower-cased) | `dp-` and 1-9 digits |
| `web+outpost://station/<code>` | `/stations/<CODE>` (upper-cased) | 2-5 letters, a dash, 1-3 digits |
| `web+outpost://handbook/<slug>` | `/handbook/<slug>` | lowercase letters and digits in up to 8 groups joined by single dashes |

Opening uses `replace`, so Back skips `/handle`. It does not check that the id exists: `web+outpost://dispatch/dp-999999` opens the not-found state of `/log/dp-999999`. Anything else shows "Not an Outpost link" with the reason: `missing`, `too-long`, `encoded` (a `%` is left after the single decode, meaning the link was encoded twice), `scheme`, `resource`, `identifier`. The page never follows the input itself; it builds the path from the matched identifier. To test without registering a handler, open `/handle?uri=web%2Boutpost%3A%2F%2Fdispatch%2Fdp-000001`. Write the `+` as `%2B`: a literal `+` in a query string decodes to a space and the page answers `scheme`.

### 11.4 Icons

All in `public/icons/` (generated by `npm run icons` from one SVG; ground colour `#17150F`, paper and flare-red mark). All PNG, opaque, no alpha. Served as `no-cache` (class "other").

| File | Size | Purpose to declare | Notes |
|---|---|---|---|
| `icon-192.png` | 192x192 | `any` | also the `icon` field of every push payload |
| `icon-512.png` | 512x512 | `any` | |
| `maskable-512.png` | 512x512 | `maskable` | the mark is scaled to 54% of the side so it stays inside the maskable safe zone; declare it as its own entry, not as `"any maskable"` (the Lab checklist warns about that) |
| `apple-touch-icon.png` | 180x180 | not a manifest icon | for `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">` |

`/favicon.svg` is the tab icon and is already linked.

Colours the app already uses: the static `<meta name="theme-color">` in `index.html` is `#ede8da`; once the app runs, the settings store rewrites it to `#ECE6D6` (light theme) or `#12110D` (dark theme). The manifest has one `theme_color`, so the installed app and the in-browser tab can differ.

### 11.5 What the Lab checklist verifies

Lab → Environment → "Manifest and installability". Levels: pass, warn, fail and info (shown as "Note").

| Group | Check, and how it is graded |
|---|---|
| Identity | `name`: fail if neither `name` nor `short_name` exists, warn if only `short_name`. `short_name`: warn if missing or longer than 12 characters. `theme_color`, `background_color`: warn if missing, fail if not a CSS colour. |
| Launch | `start_url`: warn if missing or not a real route, fail if it does not parse or is on another origin. `scope`: info if not declared, fail if `start_url` is outside it (the browser drops it). `display`: fail unless `standalone`, `fullscreen` or `minimal-ui`; a missing value and `browser` both fail. `id`: warn if missing, fail if it does not parse. |
| Icons | Fail without a 192x192 and a 512x512 icon with purpose `any`. Warn without a `maskable` icon, and warn on an icon declared `"any maskable"`. Fail on any icon or screenshot whose `src` is unreachable or not `image/*` (cross-origin sources are not fetched). Screenshots are info when absent. |
| Integration | Shortcuts: fail without a `name` or `url`, outside the scope, or not a real route; info when there are none. `share_target`: the action fails when outside the scope or not a route and warns when it is not `/share-target`; method `GET` passes, `POST` warns, anything else fails; `params` must name `title`, `text`, `url` or `files` (files need `POST` and `multipart/form-data`). `protocol_handlers`: fail unless the protocol starts `web+` (or is on the browser's safelist), the `url` contains `%s` and it resolves to a real route; warn when the route is not `/handle`. `launch_handler.client_mode`: fail unless one or more of `auto`, `navigate-new`, `navigate-existing`, `focus-existing`; info when absent. |
| Environment | `secure context`: pass or fail. `service worker`: pass when a worker controls this page, otherwise info. |

"Real route" means a match in `src/router.tsx` other than a `*` route.

---

## 12. Chaos and the lab endpoints

### 12.1 Rules

Chaos runs after request-id stamping and before body parsing and routing, on every request except `/api/_lab/*`: pages and assets and media included. Order of evaluation:

1. `serverOffline`: the socket is destroyed, log `chaos: 'server-offline'`. Beats everything but the lab.
2. The first rule that is `enabled`, whose `method` matches (`HEAD` counts as `GET`; `ANY` matches all) and whose `pathPrefix` the request path starts with.
3. The rule's delay always applies: `latencyMs + random(0..jitterMs)`. Then, with `probability`, its `mode` replaces the real answer. A rule that neither delayed nor broke the request leaves no trace; otherwise the response carries `X-Chaos`.

`ChaosRule` fields: `id`, `label`, `enabled`, `method` (`ANY`, `GET`, `POST`, `PUT`, `PATCH`, `DELETE`), `pathPrefix`, `latencyMs` (0-60000), `jitterMs` (0-60000), `probability` (0-1), `mode`, `status` (400-599, for `status`), `retryAfterSec` (0-3600, for `rate-limit`).

### 12.2 Modes

What the server does was checked with curl against a running instance. The kind column is what the Lab's own expectations (`src/lab/components/ChaosModel.ts`) say `apiFetch` reports with the server reached directly; behind the Vite dev proxy, dropped sockets surface as 502 or 504 (`unavailable`) or `timeout` instead.

| Mode | Server does | Expected `AppError.kind` | PWA behaviour it exercises |
|---|---|---|---|
| `pass` | latency only, then the real answer | none (late) | network-first timeouts, stale-while-revalidate hiding the wait |
| `status` | the rule's `status` and an error body | by status (5.2) | do not cache a 5xx; fall back to the last good copy |
| `drop` | destroys the socket before answering (`curl` exit 52) | `network` (`offline` if the browser says so) | queue failed writes, replay with the same key |
| `hang` | never answers, up to 120 s | `timeout` | `AbortSignal.timeout` inside the `fetch` handler |
| `html-200` | 200 `text/html` captive-portal page | `parse` | check `Content-Type` before `cache.put` |
| `empty-200` | 200, `Content-Length: 0`, JSON content type | `parse` | a 200 is not a good response |
| `corrupt-json` | 200 JSON that stops being valid | `parse` | validate before storing |
| `truncate-json` | 200 with `Content-Length: 4096`, the first bytes of a dispatch page, then the socket is destroyed (`curl` exit 18) | `network`, raised while reading the body | do not store a half-written entry |
| `slow-body` | the real body in about 40 chunks, 150 ms apart (about 6 s). Headers go out at once. The stock rule is GET-only. | none, or `timeout` | `fetch` resolves on headers; `respondWith` held open holds the page |
| `rate-limit` | 429, `Retry-After: <retryAfterSec>`, error body with `details.retryAfterSec` | `rate-limited` | background sync must back off |
| switch `serverOffline` | destroys every non-lab socket, pages and assets too | `network` / `offline` | the offline fallback, cached navigations |
| switch `schemaDrift` | dispatch payloads (`/api/dispatches*` and digest items) switch to `{ id, station_id, title, body, level: 1-4, filed_at }`; single-dispatch ETags gain `-drift` | `schema-mismatch` on dispatch requests only | a cache outlives a deploy: validate, version cache names |

### 12.3 Presets

`POST /api/_lab/chaos/preset/<name>` toggles a stock rule on or off (a deleted stock rule is added back, enabled), toggles a switch, or clears everything. It answers with the full `ChaosState`. An unknown name is 404 and the message lists the valid ones. The default rules all start disabled.

| Preset id | Rule (method, path prefix, mode) | Effect | Expected kind | PWA behaviour |
|---|---|---|---|---|
| `lie-fi` | ANY `/api`, `pass`, 4000 ms + up to 5000 ms | every `/api` request, writes too, waits 4-9 s | none by default; `timeout` if the request timeout is set below the wait | network-first needs its own timeout; the probe reports lie-fi |
| `flaky` | ANY `/api`, `status` 500, p 0.3 | three in ten requests fail | `server` | never cache the 5xx; fall back; retry with backoff |
| `captive-portal` | ANY `/api`, `html-200` | every `/api` request returns an HTML sign-in page | `parse` | check `Content-Type` |
| `slow-8s` | ANY `/api`, `pass`, 8000 ms | every `/api` request is held 8 s | none by default; `timeout` if the request timeout is below 8 s | request timeouts, navigation preload |
| `corrupt-json` | ANY `/api`, `corrupt-json` | | `parse` | validate before storing |
| `rate-limited` | ANY `/api`, `rate-limit`, p 0.5, `Retry-After: 5` | half of requests get 429 | `rate-limited` | honour `Retry-After` |
| `stale-chunks` | ANY `/assets/`, `status` 404 | every asset answers 404 with a JSON error body | `not-found`; `chunk-load` from a lazy route | precache the current build, keep the previous one's chunks |
| `drop-writes` | POST `/api`, `drop`, p 0.5 | half of the POSTs lose their socket | `network` | outbox and replay with the same key |
| `truncate` | GET `/api/dispatches`, `truncate-json` | the feed (and `/api/dispatches/:id`) arrives truncated | `network` on body read | do not keep a partial copy |
| `hang-signal` | GET `/api/signal`, `hang` | the signal board never answers | `timeout` | request timeouts |
| `empty-body` | ANY `/api`, `empty-200` | | `parse` | a 200 is not proof |
| `slow-body` | GET `/api`, `slow-body` | | none, or `timeout` | streaming |
| `hard-down` | switch `serverOffline` | | `network` / `offline` | offline fallback |
| `schema-drift` | switch `schemaDrift` | | `schema-mismatch` | cache vs deploy |
| `all-clear` | - | turns both switches off and disables every rule (rules stay) | - | run it before and after |

Note on `truncate`: its prefix is `/api/dispatches`, so it also hits `GET /api/dispatches/:id`. The prefix `/api` also matches `/api/ping`, which is how a rule on `/api` answers the reachability probe too. To exempt a path, narrow the prefix with `PUT /api/_lab/chaos`.

### 12.4 Lab endpoints

All `/api/_lab/*`: never chaos'd, not in the request log, `Cache-Control: no-store`. Writes with an `Origin` header whose host differs from `Host` get 403; curl sends none. Unknown paths under the prefix are 404 JSON.

| Endpoint | Body | Response | Notes |
|---|---|---|---|
| `GET /api/_lab/state` | - | `LabState`: `serverInstance`, `startedAt`, `chaos`, `wire`, `release`, `headerProfile`, `sessionTtlSec`, `counters{requests, chaosInjected, dispatches, pushSent, subscriptions, sessions}` | |
| `GET /api/_lab/truth` | - | `LabTruth`: `asOf`, `feedRev`, `inbox`, per-dispatch `{ id, rev, read, acked, starred }`, per-station `{ id, rev }`, bench `{ strategy, key, rev, hits }`, `handbookEdition`, `session` (the caller's) | what the server believes now; the Consistency lab compares against it |
| `GET /api/_lab/chaos` | - | `ChaosState` | |
| `PUT /api/_lab/chaos` | `ChaosState`: `serverOffline`, `schemaDrift`, `rules[]` (unique ids, at most 50) | the stored state | replaces everything |
| `POST /api/_lab/chaos/preset/:name` | - | `ChaosState` | see 12.3 |
| `PUT /api/_lab/wire` | partial `WireState`: `auto`, `everySec` (2-3600), `pushOnNew` | `WireState` | |
| `POST /api/_lab/wire/spawn` | `{ count?: 1-10 (default 1), severity? }`; body optional | 201 `{ spawned: [{ id, severity, title }] }` | |
| `PUT /api/_lab/release` | partial `{ latestClient, minClient }` (semver), `api` (1-99), `handbookEdition` (1-24 characters) | `ReleaseState` | `minClient` above the running version raises the forced-upgrade dialog; `api` changes `X-Api-Version` (api-mismatch); a new `handbookEdition` makes cached chapters disagree with the index |
| `PUT /api/_lab/headers` | `{ profile }` | `{ profile }` | section 4 |
| `POST /api/_lab/session` | `{ action: 'expire' }` or `{ action: 'set-ttl', ttlSec: 1-86400 }` | `{ sessionTtlSec, sessions }` | `set-ttl` applies to sessions created afterwards |
| `GET /api/_lab/log?since=<seq>` | - | `{ entries: RequestLogEntry[], lastSeq }` | ring of 500; `seq` never resets |
| `DELETE /api/_lab/log` | - | the (empty) page | |
| `GET /api/_lab/events` | - | server-sent events: `hello`, `state`, `log`, `wire`, `push`; comment heartbeat every 15 s | |
| `POST /api/_lab/reset` | - | `LabState` | reseeds dispatches (ids restart at `dp-000001`, rev 1, fresh `filedAt`), stations and bench counters; drops sessions and idempotency keys; default chaos rules, wire, release, `realistic` profile; clears the log and delayed pushes. Keeps VAPID keys, subscriptions and the dispatch counter. A client holding a pre-reset ETag then gets 304 for the same id: hard-reload. |

`RequestLogEntry`: `seq`, `ts`, `method`, `path` (with query), `status` (0 = socket dropped or client gone), `durationMs`, `bytes`, `requestId`, `dest`/`mode`/`site` (the `Sec-Fetch-*` headers), `tab` (`X-Tab-Id` or null), `chaos` (rule label or `server-offline`), `notes[]`, `reqHeaders` (`if-none-match`, `if-match`, `if-modified-since`, `idempotency-key`, `cache-control`, `range`, `purpose` when present). Notes seen: `etag-304`, `idempotent-replay`, `if-match-412`, `unauthorized`, `validation-failed`.

### 12.5 Curl recipes

Every command below was run against a local instance of this server (state reset first; output trimmed). Use `B=http://localhost:4000` with `npm run pwa`. Keep a cookie jar for anything that needs a session.

```bash
B=http://localhost:4000
J='Content-Type: application/json'
```

State and truth:

```bash
curl -s $B/api/_lab/state                 # LabState
curl -s $B/api/_lab/truth                 # what the server holds right now
curl -s "$B/api/_lab/log?since=0"         # {entries:[...], lastSeq:N}
```

Conditional GET (304):

```bash
curl -si -H 'If-None-Match: W/"dp-000001-r1"' $B/api/dispatches/dp-000001 | head -4
# HTTP/1.1 304 Not Modified ... ETag: W/"dp-000001-r1"
```

Sign in, file, replay (201 then 200):

```bash
curl -s -c jar.txt -X POST $B/api/session -H "$J" -d '{"callsign":"curl-op"}'
curl -si -b jar.txt -X POST $B/api/dispatches -H "$J" -H 'Idempotency-Key: curl-test-0001' \
  -d '{"clientId":"curl-test-0001","stationId":"KRN-07","title":"Test dispatch","body":"Hello","severity":"routine","filedAtClient":"2026-10-06T05:00:00.000Z"}'
# HTTP/1.1 201 Created  Location: /api/dispatches/dp-0000NN  ETag: W/"dp-0000NN-r1"   (NN: the counter continues across resets)
# run it again with the same key:
# HTTP/1.1 200 OK  Idempotent-Replay: true   (same dispatch; a different body is ignored)
```

Without a session: `{"error":{"code":"unauthorized",...}}` with 401, whatever the body.

Conflict (412) and the current copy:

```bash
curl -s -X PATCH $B/api/dispatches/dp-000002 -H "$J" -d '{"starred":true}'      # rev 1 -> 2, no session needed
curl -si -X PATCH $B/api/dispatches/dp-000002 -H "$J" -H 'If-Match: W/"dp-000002-r1"' -d '{"read":true}'
# 412 conflict, ETag: W/"dp-000002-r2", details.current = the dispatch
# (with a correct If-Match, W/"dp-000002-r2", the same patch is a 200)
```

Expire the session, then watch a write fail:

```bash
curl -s -X POST $B/api/_lab/session -H "$J" -d '{"action":"expire"}'   # {"sessionTtlSec":600,"sessions":0}
curl -s -b jar.txt $B/api/session                                       # {"session":null}
```

Digest, and make something to fetch:

```bash
curl -s -X POST $B/api/_lab/wire/spawn -H "$J" -d '{"count":2,"severity":"urgent"}'
curl -s "$B/api/digest?since=2026-10-06T04:00:00Z"
curl -s -o /dev/null -w '%{http_code}\n' "$B/api/digest?since=2026-10-06T04:00:00"   # 422: no zone
curl -s -X PUT $B/api/_lab/wire -H "$J" -d '{"auto":true,"everySec":5}'              # one every 5 s; turn off with {"auto":false}
```

Bench: the server's own count shows whether a cache answered.

```bash
curl -s $B/api/bench/cache-first/alpha      # "hits":N
curl -s -X POST $B/api/bench/cache-first/alpha/bump   # {"rev":2}
curl -s -o /dev/null -w '%{http_code}\n' $B/api/bench/cache-first/omega   # 404
```

Chaos and the header profile:

```bash
curl -s -X POST $B/api/_lab/chaos/preset/captive-portal   # toggles; returns ChaosState
curl -si $B/api/stations | grep -iE '^(HTTP|content-type|x-chaos)'   # 200, text/html, X-Chaos: Captive portal (HTML 200)
curl -s -X POST $B/api/_lab/chaos/preset/all-clear
curl -s -X PUT $B/api/_lab/headers -H "$J" -d '{"profile":"http-cache-trap"}'
curl -sI -H 'Accept: text/html' $B/ | grep -i cache-control   # max-age=31536000
curl -s -X PUT $B/api/_lab/headers -H "$J" -d '{"profile":"realistic"}'
```

Always on one path, with a fixed rate-limit answer:

```bash
curl -s -X PUT $B/api/_lab/chaos -H "$J" -d '{"serverOffline":false,"schemaDrift":false,"rules":[{"id":"r","label":"always 429","enabled":true,"method":"ANY","pathPrefix":"/api/stations","latencyMs":0,"jitterMs":0,"probability":1,"mode":"rate-limit","status":500,"retryAfterSec":7}]}'
curl -si $B/api/stations | grep -iE '^(HTTP|retry-after|x-chaos)'   # 429, Retry-After: 7, X-Chaos: always 429
```

Release and version:

```bash
curl -s -X PUT $B/api/_lab/release -H "$J" -d '{"latestClient":"1.1.0","minClient":"1.0.5","handbookEdition":"1988.5"}'
curl -s $B/api/version                  # latestClient/minClient reflect it
```

Push without a browser (no subscription, so nothing is delivered, but the payload comes back):

```bash
curl -s -X POST $B/api/push/send -H "$J" -d '{"kind":"dispatch","dispatchId":"dp-000064"}'   # PushSendResult.payload
curl -s -X POST $B/api/push/send -H "$J" -d '{"kind":"silent-badge","badgeCount":3}'
curl -s -X POST $B/api/push/send -H "$J" -d '{"kind":"custom"}'                              # 422: needs a title
curl -s $B/api/push/vapid
```

Reset:

```bash
curl -s -X POST $B/api/_lab/reset
```

Pitfalls seen while running these:

- `curl` sends `Accept: */*`, so `curl $B/log` is a 404 text body; add `-H 'Accept: text/html'`.
- A dropped or truncated response shows as `curl: (52) Empty reply from server` or `(18) transfer closed`.
- `HEAD /api/signal` and `HEAD /api/bench/...` count as requests: `seq` and `hits` advance.
- Delete or switch off a rule you no longer want; presets toggle, so applying the same one twice turns it off.
