# Outpost — architecture & build spec

Outpost is a **deliberately over-featured, ordinary React + TypeScript website** (a field-station dispatch log) whose only purpose is to be a **playground for learning PWAs**. It has real data with real failure modes, a Node backend with fault injection, and a "Lab" section that makes every caching / update / sync / error mechanism observable.

> **Hard rule — the PWA code is the learner's job.** Nobody building this project writes a service worker, a web app manifest, `navigator.serviceWorker.register`, push subscription code, background-sync registration, `setAppBadge`, `navigator.share`, or `beforeinstallprompt` handling.
> All of that lives behind the stubs in `src/pwa/` (they reject with `PwaNotImplementedError`). The website calls *only* those seams, through `callSeam()` (see below). Until the learner fills them in, the site must behave like a perfectly good ordinary website, and every stub must degrade gracefully (no crashes, no scary red screens — a muted "not wired up yet" state).
> What the app **does** own: the page side of the SW message protocol (`shared/sw-protocol.ts`), read-only observers of browser-managed state (Cache Storage listing, registrations listing, storage estimate, capability detection, manifest viewer), and everything that is "a website as usual".

## Run modes

| command | what | use it for |
|---|---|---|
| `npm run dev` | Vite on :5173 (HMR) + API on :4000 (proxied `/api`, `/media`) | building UI. Service workers work on localhost here, but module URLs are unhashed. |
| `npm run pwa` | `vite build` then the Node server serves **dist + API on :4000** with production-like cache headers and SPA fallback | real PWA testing. Use this one. |
| `npm run release` | bump version + rebuild (scripts/release.mjs) | practising updates: old tab, new deploy |
| `npm test` | vitest | contract + unit tests |

Env: `PORT` (default 4000), `APP_VERSION`, `BUILD_ID` (build-time). Globals `__APP_VERSION__`, `__BUILD_ID__`, `__BUILD_TIME__` are available in client code.

## Stack

Vite 8 · React 19 · TypeScript (strict) · React Router 7 (data router, `createBrowserRouter`, lazy route modules) · TanStack Query 5 (+ persist client, IndexedDB via idb-keyval) · Zod 4 · Zustand 5 · Express 5 · web-push. Plain CSS (global tokens + CSS Modules). **No** Tailwind, no component library, no icon library, no runtime CDN — fonts are self-hosted (`@fontsource-variable/*`) because the app must work offline.

## Conventions (all code)

- TypeScript strict. No `any` (eslint enforces), no `@ts-ignore`; `unknown` + narrowing. `import type` for types.
- Path aliases: `@/` → `src/`, `@shared/` → `shared/`. The server imports shared code with relative paths.
- **Every** server response is validated client-side with the zod schemas in `shared/contracts.ts` (via `apiFetch`). Never `as` a fetch result.
- **Every** failure becomes an `AppError` (`src/lib/errors`). UI branches on `error.kind`, never on message text.
- Async UI has four states and all four are designed: loading (skeleton / "signal bars" loader), empty, error (`<ErrorState error={…} />`), populated. Plus a fifth for this app: *stale/cached* — show the provenance chip when the lab setting is on.
- Anything that can be offline-hostile must say so in UI copy: what you're looking at, how old it is, where it came from.
- Accessibility: semantic HTML, visible `:focus-visible` rings, `aria-live="polite"` for status changes, labels for every control, keyboard operable dialogs/tabs, `prefers-reduced-motion` respected, colour never the only signal (severity has text + shape). Contrast ≥ 4.5:1 in both themes.
- Responsive: works at 360px wide up to wide desktop. Mobile = bottom tab bar; desktop = left rail.
- No `Math.random()`/`Date.now()` during render. No `console.log` left in (use `console.warn/error` only for genuine faults).
- No emoji anywhere in UI or copy. No lorem ipsum. Copy is dry, specific and human (a field-radio operator's register), never chirpy. No "Oops!", no "Welcome back!", no "Let's get started".
- Keep files focused (< ~300 lines; split components). Colocate `Foo.tsx` + `Foo.module.css`.
- Each lab page explains *what you are looking at* and *what to try* in a short "Field notes" block at the top (2–4 sentences + 2–4 concrete experiments). This is the learning surface — write it well.

## Design language — "field log"

The product is a **physical logbook crossed with a teletype console** for remote observation stations. Functional, dense, tactile, slightly austere. It must NOT look like generic AI/SaaS UI.

- **Forbidden:** gradients (any), glassmorphism/backdrop-blur, soft drop-shadow cards, big rounded corners, pill-everything, purple/indigo/blue-violet palettes, emoji or emoji-like icons, icon-in-tinted-circle, centered hero + three feature cards, "Inter + rounded-xl + subtle shadow" look, illustrations of people, stock-UI skeleton shimmer gradients.
- **Palette** (tokens in `src/styles/tokens.css`, both themes, all colours as CSS custom properties — no hex outside tokens):
  - Light "daylight ledger": paper `#ECE6D6`, raised paper `#F4F0E4`, sunk paper `#E0D9C5`, ink `#17150F`, muted ink `#5E5848`, rule `rgba(23,21,15,.22)`, strong rule = ink.
  - Dark "night watch": bg `#12110D`, raised `#1A1914`, sunk `#0C0B09`, text `#E7E0CC`, muted `#9A937D`, rule `rgba(231,224,204,.2)`.
  - One accent, **flare** `#E2461C` (dark theme `#FF5A2B`). Semantic only: ok = lichen `#4A7A3A`/`#7BB26A`, warn = amber `#B97A00`/`#E8A92E`, error = flare red, info = survey blue `#2C5282`/`#7FA6D6`. The Lab zone (`[data-zone="lab"]`) swaps the accent to phosphor green (`#1F7A4A` / `#4FE39A`) so it is always obvious you're in the instruments, not the product.
- **Type:** display = *Big Shoulders Display* (condensed, uppercase, tight tracking, used for titles/numerals); reading = *Newsreader* (dispatch bodies, handbook); UI/data = *Spline Sans Mono* (labels, tables, chips, controls; `font-variant-numeric: tabular-nums`). Never Inter/Roboto/system-ui.
- **Shape & surface:** square corners (0–2px radius), 1.5px ink borders, ruled lines, hard offset shadow (`3px 3px 0 var(--ink)`) only on raised/pressed affordances. Flat fills. Registration/crop marks on panel corners, index numbers (`№ 0142`), fig. labels, ledger tables with rule lines instead of zebra fills. Severity = rubber **stamps**: uppercase mono, bordered, rotated −1.5°…−2.5°, different border *style* per level (routine: thin, notice: solid, urgent: double, critical: solid + inverted fill) so it never depends on colour alone.
- **Layout:** asymmetric grid, left rail (desktop) with vertical rhythm, a 28px **telemetry strip** on top (mono ticker: net state, server reach, SW state, version/build, callsign, queue count). Content max-width ~1240px; dense but breathable.
- **Motion:** minimal. `steps()`-based blink/typewriter for live indicators, 120ms transitions, nothing bouncy. Reduced-motion = no animation.
- **Icons:** custom inline SVG, 20px grid, 1.5px stroke, square caps/miter joins, in `src/ui/icons`.
- **Media:** server-generated two-tone contour/line-art SVGs (`/media/...`) in ink + flare.

## Folder map & ownership

```
shared/                  contracts.ts, sw-protocol.ts                       (written — do not break; additive changes only, tell the integrator)
server/                  Express API + chaos + push + static              (server agents)
src/main.tsx, router.tsx, App.tsx                                           (shell agent)
src/styles/              tokens.css, base.css, fonts.ts                     (design-system agent)
src/ui/                  design-system components, icons, index.ts barrel   (design-system agent)
src/shell/               AppShell, status strip, nav, banners, pages/       (shell agent)
src/lib/notify.ts        toast store                                        (written)
src/lib/errors/          AppError (written), normalize, center, boundary    (foundation-1)
src/lib/api/             types (written), client, provenance, net-log       (foundation-1)
src/lib/net/             status/reachability, resource-log                  (foundation-1)
src/lib/query/           queryClient, persister, settings wiring            (foundation-1)
src/lib/settings/        app settings + lab settings stores                 (foundation-1)
src/lib/storage/         safe localStorage/IDB helpers                      (foundation-1)
src/lib/tabs/            BroadcastChannel tab sync + presence               (foundation-1)
src/lib/bridge/          callSeam + bridge log + SW message bridge          (foundation-1)
src/lib/version/         semver, version/deploy watcher                     (foundation-1)
src/lib/lab/             SSE feed (server log, lab state)                   (foundation-1)
src/lib/queries/         endpoints, query keys, data hooks, mutations       (foundation-2)
src/pwa/                 STUBS — the learner's territory (written)
src/features/<name>/     product pages (see routes)                         (feature agents)
src/lab/                 Lab pages + lab-only components                    (lab agents)
docs/                    ARCHITECTURE.md (this), CONTRACTS.md, LEARNING.md  (docs agent)
```

## Routes and the page-file contract

The router lazy-loads each page: `lazy: () => import('<file>')` and expects a **default-exported React component**. Pages fetch with hooks from `src/lib/queries` (no router loaders). Every route has an `errorElement`.

| path | file | notes |
|---|---|---|
| `/` | — | redirects to `/log` |
| `/log` | `src/features/dispatches/pages/LogPage.tsx` | feed, filters in URL search params, infinite scroll/“load more” |
| `/log/:id` | `src/features/dispatches/pages/DispatchPage.tsx` | detail, ack/star/read (optimistic), Share button (seam) |
| `/file` | `src/features/compose/pages/ComposePage.tsx` | new dispatch; prefill from `?title&text&url&station`; **manifest shortcut target** |
| `/drafts` | `src/features/compose/pages/DraftsPage.tsx` | local drafts + outbox (seam) |
| `/share-target` | `src/features/compose/pages/ShareTargetPage.tsx` | incoming Web Share (GET `?title&text&url`) → draft → `/file` |
| `/handle` | `src/features/compose/pages/HandlePage.tsx` | protocol handler landing `?uri=web+outpost://dispatch/dp-000123` |
| `/inbox` | `src/features/inbox/pages/InboxPage.tsx` | unread triage; **shortcut target** |
| `/stations` | `src/features/stations/pages/StationsPage.tsx` | stale-while-revalidate showcase |
| `/stations/:code` | `src/features/stations/pages/StationPage.tsx` | |
| `/signal` | `src/features/signal/pages/SignalPage.tsx` | live board, network-only showcase; **shortcut target** |
| `/handbook` | `src/features/handbook/pages/HandbookPage.tsx` | cache-only showcase |
| `/handbook/:slug` | `src/features/handbook/pages/ChapterPage.tsx` | |
| `/settings` | `src/features/settings/pages/SettingsPage.tsx` | callsign/session, appearance, notifications, install, background refresh, badge, storage |
| `/offline` | `src/shell/pages/OfflinePage.tsx` | what a service worker would fall back to |
| `*` | `src/shell/pages/NotFoundPage.tsx` | |
| `/lab` | `src/lab/pages/LabHomePage.tsx` | overview + index of instruments |
| `/lab/environment` | `src/lab/pages/EnvironmentPage.tsx` | capability matrix, display mode, manifest viewer, storage |
| `/lab/worker` | `src/lab/pages/WorkerPage.tsx` | registrations, lifecycle log, controller, SW messages |
| `/lab/caches` | `src/lab/pages/CachesPage.tsx` | Cache Storage explorer |
| `/lab/bench` | `src/lab/pages/BenchPage.tsx` | the five strategies, side by side |
| `/lab/consistency` | `src/lab/pages/ConsistencyPage.tsx` | server truth vs React Query vs Cache Storage |
| `/lab/network` | `src/lab/pages/NetworkPage.tsx` | client log + server log, joined |
| `/lab/chaos` | `src/lab/pages/ChaosPage.tsx` | fault injection |
| `/lab/server` | `src/lab/pages/ServerPage.tsx` | wire simulator, release simulator, headers profile, session, push console |
| `/lab/queue` | `src/lab/pages/QueuePage.tsx` | seam call log, outbox, tabs, SW message log |
| `/lab/errors` | `src/lab/pages/ErrorsPage.tsx` | error centre + error simulator |
| `/lab/query` | `src/lab/pages/QueryPage.tsx` | React Query cache explorer + settings |

Manifest shortcut targets the learner will use: `/file`, `/inbox`, `/signal`. `share_target` action: `/share-target`. Protocol handler: `/handle`.

## Server spec (`server/`, Express 5 + tsx, port `PORT || 4000`)

Everything is in-memory and deterministic (seeded PRNG), except VAPID keys + push subscriptions which persist in `server/.data/`. Start log prints URLs and whether `dist/` is being served.

**Middleware order** (in `server/index.ts`): meta (request id, headers, log) → chaos → `express.json` → session cookie → routers (lab, push, api, bench, media) → static + SPA fallback → uniform JSON error handler.

**Every response** gets `X-Request-Id` (short id), `X-Served-At` (ISO), `X-Served-By: outpost/<serverInstance>`, `X-Api-Version: <API_VERSION>`; `Access-Control-Expose-Headers` for all custom headers. `X-Resource-Rev` where a rev exists. Errors always use `ApiErrorBody`. Unknown `/api/*` → 404 JSON (never HTML). Unknown files under `/assets/` → 404 plain text (never the SPA fallback — this is what makes stale-chunk failures real). SPA fallback (`index.html`) only for `GET` with `Accept: text/html` and no file extension, outside `/api` and `/media`.

**Cache headers** by `headerProfile` (changeable at runtime): see `HeaderProfile` in contracts. `realistic`: `index.html`, `sw.js`, `manifest.webmanifest`, `version.json` → `no-cache`; `/assets/*` → `public, max-age=31536000, immutable`; `/media/*` → `public, max-age=86400`; API → `no-cache` + ETag (`W/"<id>-r<rev>"` for single dispatch/station; express weak ETag for bodies) so `If-None-Match` → `304` (note `etag-304` in the request log). `no-store`: everything `no-store`. `http-cache-trap`: index/sw/manifest `max-age=31536000`, API `max-age=60`. `/api/_lab/*` and `/api/ping` and `/api/session` are always `no-store`. Static file handling serves `dist/` with correct MIME (`.webmanifest` → `application/manifest+json`, `.svg`, `.json`, `.js`, `.css`, `.map`).

**Endpoints** (paths/bodies/responses are in `shared/contracts.ts`; `API` has builders):

- `GET|HEAD /api/ping` → 204, no-store. The app's reachability probe.
- `GET /api/version` → `VersionInfo` (reads `ReleaseState`).
- `GET /api/session` → `SessionResponse` (200 always; `session: null` when signed out) · `POST /api/session` `{callsign}` → sets cookie `outpost_sid` (HttpOnly; SameSite=Lax; Path=/; Max-Age=ttl) → `SessionResponse` · `DELETE /api/session` → `{session:null}`. Session TTL default 600 s (lab-adjustable). Expired/unknown cookie = signed out.
- `GET /api/dispatches?severity&station&q&unread&starred&cursor&limit` → `DispatchPage` newest first, default limit 12. Cursor is opaque (base64 of index/id). `q` matches title/body/tags/station code, case-insensitive.
- `GET /api/dispatches/:id` → `Dispatch` with `ETag` + `X-Resource-Rev`; 404 `not_found`.
- `POST /api/dispatches` (**needs session** else 401 `unauthorized`) body `DispatchCreate`, header `Idempotency-Key` (falls back to body `clientId`). 201 + `Dispatch` on first create; replay of the same key → **200** same dispatch + header `Idempotent-Replay: true`. Validation failure → 422 `validation_failed` with `details: zod issues`. `filedAt` = `filedAtClient` if given and not in the future, else now. `filedBy` = operator callsign. Emits `feedRev` bump, SSE `wire`-less `log`, and — if `wire.pushOnNew` — a push.
- `PATCH /api/dispatches/:id` body `DispatchPatch`; `acked` changes **need session** (401), `read`/`starred` don't. Optional `If-Match`: mismatch → 412 `conflict` with `details: { current: Dispatch }`. Returns the updated `Dispatch` (rev+1, new ETag). No-op patch still returns 200 and does **not** bump rev.
- `GET /api/inbox/summary` → `InboxSummary` · `POST /api/inbox/read-all` → `InboxSummary`.
- `GET /api/digest?since=<iso>` → `Digest` (items filed after `since`, newest first, max 20; `since` absent = last 24 h). For periodic sync.
- `GET /api/stations` → `StationList` (ETag) · `GET /api/stations/:codeOrId` → `Station`. Station `status` and `lastContactAt` drift slowly over time (every few minutes a random station changes status / rev bump), so SWR revalidation visibly changes data.
- `GET /api/signal` → `SignalBoard`; `seq` increments on every call, readings jitter deterministically-ish. Always `no-store`.
- `GET /api/handbook` → `HandbookIndex` · `GET /api/handbook/:slug` → `HandbookChapter` (8 well-written chapters in the voice of a dry 1980s field-station operating manual; one of them, "Loss of contact procedures", is about working without a link — a deliberate echo of the PWA theme). `edition` changes only via the lab release simulator.
- `GET /api/bench/:strategy/:key` → `BenchResponse` (valid strategies/keys per contract; 404 otherwise). `hits` counts server answers per (strategy,key); `payload.sample` is a pure function of (key, rev). `POST /api/bench/:strategy/:key/bump` → `{ rev }` (and is what makes cached copies stale). The five strategies differ only in the URL — they are separate routes so the learner's SW can match each with its own strategy.
- `GET /media/dispatch/:id.svg`, `GET /media/station/:code.svg` — deterministic generated contour art (topographic rings + grid + index number), two-tone, ~3–6 KB, small artificial delay (40–120 ms) so cache-vs-network is visible.
- **Push** (`/api/push/*`): `vapid`, `subscribe`, `unsubscribe`, `subscriptions`, `send` per contract. Uses `web-push` with VAPID keys generated on first boot into `server/.data/vapid.json`. `send` builds a `PushPayload` (`v:1`; `badgeCount` default = current unread; `kind: 'dispatch'` needs `dispatchId` → fills title/body/url `/log/<id>`), honours `delaySec` (setTimeout; response says `scheduledInSec`), `targetEndpointTail`, `ttl`, `urgency`; prunes 404/410 subscriptions. `silent-badge` and `sync-poke` set `silent: true`.
- **Lab** (`/api/_lab/*`, never chaos'd, never logged in the request log, no-store): `state` (GET), `truth` (GET), `chaos` (GET/PUT full `ChaosState`; PUT validates; `POST /api/_lab/chaos/preset/:name` optional convenience), `wire` (PUT `WireState`), `wire/spawn` (POST `{count?:1..10, severity?}` files dispatches from the wire generator), `release` (PUT partial `ReleaseState`), `headers` (PUT `{profile}`), `session` (POST `{action:'expire'|'set-ttl', ttlSec?}`), `log` (GET `?since=<seq>` → `RequestLogPage`; ring of 500; DELETE clears), `events` (SSE `LabEvent`, heartbeat comment every 15 s), `reset` (POST — re-seed data, clear log, default chaos/wire/release/profile; keeps VAPID + subscriptions).
- **Wire generator:** a pool of realistic dispatch templates (barometer drops, sea ice breakup, relay mast icing, supply drop slipped, generator swap, aurora interference…) × stations × severities; auto mode files one every `everySec`. Emits SSE `wire`; optionally push.
- **Chaos:** per `ChaosRule` semantics in contracts. Matching: first enabled rule where method matches and `req.path.startsWith(pathPrefix)` (skip `/api/_lab`). Latency = `latencyMs + U(0..jitterMs)` always; then with `probability` apply `mode`. Injected responses set `X-Chaos: <rule label>`. `serverOffline` destroys every non-lab socket immediately and sets `chaos: 'server-offline'` in the log. `schemaDrift`: dispatch-shaped JSON (`/api/dispatches*`, digest items) is emitted as `DriftedDispatch` fields (keep same top-level envelope, swap item shape). Presets (client has them as data; server just stores rules): *Lie-fi* (all GET latency 4–9 s jitter), *Flaky 30%* (`/api` status 500 p=.3), *Hard down* (serverOffline), *Captive portal* (`/api` html-200 p=1), *Slow 8 s*, *Corrupt JSON*, *Rate limited*, *Stale chunks* (`/assets/` status 404), *Schema drift*.
- **Request log:** every non-lab request → `RequestLogEntry` on response finish/close (status 0 if the socket was destroyed/aborted), SSE `log` event.
- **Static:** serves `dist/` if it exists; otherwise API-only with a console hint to run `npm run build`.

## Client foundation spec

**`apiFetch<T>(opts): Promise<ApiResult<T>>`** (`src/lib/api/client.ts`) — the only place that calls `fetch` for app data. Options: `{ method?, path, query?, body?, schema, headers?, signal?, timeoutMs?, ifMatch?, idempotencyKey?, cache?, allowEmpty? }`. Always sends `X-Tab-Id`; JSON bodies; `Accept: application/json`; `credentials: 'same-origin'`. **Does not pre-fail when `navigator.onLine` is false** — a service worker may well answer. Throws only `AppError` (classification in `normalize.ts`/`client.ts`): rejected fetch → `offline` (if `navigator.onLine === false`) else `network`; own timeout → `timeout`; caller abort → `aborted`; non-JSON content-type or empty/garbled body on 2xx → `parse` (message names the content-type; HTML ⇒ "looks like a captive portal or SPA fallback"); status map (401 `unauthorized`, 403 `forbidden`, 404 `not-found`, 409/412 `conflict`, 400/422 `validation`, 429 `rate-limited` (+`retryAfterSec`), 503/502/504 `unavailable`, other 5xx `server`, other `http`); 504 + `X-SW-Source: cache-miss` → `cache-miss`; zod failure → `schema-mismatch` (context lists issues); uniform error body decoded into `context.code/requestId/details`; `X-Chaos` copied into `context.chaos`. On success builds `ResponseMeta` (see types; includes `PerformanceResourceTiming` lookup for `transferSize`/`deliveryType`, and `source` decided in `provenance.ts` with documented precedence: SW headers → `deliveryType/transferSize` heuristics → network). Every call (success or failure) is appended to `useNetLog` (ring of 300: start time, method, url, status, duration, source, error kind, requestId). `X-Api-Version` mismatch is noted in the version store.

**Net status** (`useNetStatus()`): `{ browserOnline, server: 'unknown'|'reachable'|'unreachable', lieFi, lastProbeAt, lastLatencyMs }`. Probes `HEAD /api/ping` (3 s timeout) on start, `online`/`offline`/`focus`/`visibilitychange`, on interval (setting), and after any `network`/`timeout` AppError. `lieFi = browserOnline && server === 'unreachable'`. Also `useResourceLog()`: `PerformanceObserver('resource')` ring of 400 capturing *every* resource (scripts, chunks, fonts, images, fetch) with `transferSize`, `deliveryType`, `duration`, `initiatorType`, `nextHopProtocol` (this is how you see chunk/asset/font loads that never pass through `apiFetch`).

**Query client** (`src/lib/query`): one `QueryClient`; `retry` = `(n, err) => err is retryable AppError && n < settings.retries`; delay = exponential + jitter capped 8 s; default `networkMode` from lab settings (`offlineFirst` default); `staleTime`/`gcTime`/`refetchOnWindowFocus` from lab settings, applied live via `setDefaultOptions`. `QueryCache.onError` / `MutationCache.onError` → `errorCenter.report` (skip `aborted`, skip queries with `meta.silent`). Persistence: `PersistQueryClientProvider` with an IndexedDB (`idb-keyval`) async persister, **off by default** (lab setting, applies on reload), `buster` from setting (`version` | `build` | `none`), `maxAge` 24 h, dehydrate only successful queries not under `['lab', …]` or `['session']`, hydration failures reported and the bad cache deleted. Every data query carries `meta: { url: '<api path>' }` so the SW bridge can invalidate by URL.

**Settings stores** (zustand + safe localStorage, cross-tab synced): *app* `{ theme: 'light'|'dark'|'system', density: 'comfortable'|'compact' }` (applies `data-theme`, `<meta name=theme-color>`, writes `outpost.theme` for the pre-paint script in index.html); *lab* `{ staleTimeSec:30, gcTimeMin:1440, networkMode:'offlineFirst', retries:2, refetchOnFocus:true, persistQueryCache:false, rqBuster:'version', requestTimeoutMs:10000, tabSync:true, showProvenance:true, probeIntervalSec:15, deployWatchSec:60 }`.

**Errors** (`src/lib/errors`): `AppError` (written). `toAppError(unknown, ctx?)` recognises: `AppError` (pass-through), `PwaNotImplementedError` → `not-implemented`, fetch `TypeError`, `DOMException` names (`AbortError`, `TimeoutError`, `NotAllowedError`/`SecurityError` → `permission`, `NotSupportedError`/`TypeError: x is not a function` on missing APIs handled by callers → `unsupported`, `QuotaExceededError` → `quota`), `ZodError` → `schema-mismatch`, dynamic-import failure messages (`Failed to fetch dynamically imported module`, `error loading dynamically imported module`, `Importing a module script failed`, `ChunkLoadError`) → `chunk-load`, everything else → `unknown`. `errorCenter` (zustand): ring of 200, adjacent-duplicate collapsing (`count`), `report(err, {source, silent})`, `clear()`, per-kind counts. `installGlobalErrorHandlers()` (`error`, `unhandledrejection`, Vite's `vite:preloadError` → report `chunk-load` + set `chunkLoadFailed` in the version store). `<ErrorBoundary fallback={(error, reset) => …}>` class component reporting `render` errors with component stack.

**Seams** (`src/lib/bridge`): `callSeam(feature, fn, { quiet? })` wraps every call from app code into `pwa.*`: records `{at, feature, outcome: 'ok'|'not-implemented'|'error', durationMs, error?}` in `useBridgeLog` (ring 200), never throws for `not-implemented` when `quiet`, reports other errors to `errorCenter`, and rethrows a normalised `AppError` otherwise (so buttons can show the exact state). `startSwMessageBridge({ navigate })`: listens on `navigator.serviceWorker` `message` (if present) and the `outpost-sw` BroadcastChannel; every raw message is stored in `useSwMessageLog` (ring 100; invalid ones kept with the zod `reason`); reactions: `cache-updated` → invalidate queries whose `meta.url` matches (pathname equality or prefix) · `sync-complete` → invalidate dispatches/inbox, refresh `queuedCount` via `callSeam('sync.listQueued')`, toast · `periodic-sync-complete` → invalidate digest/inbox · `navigate` → `navigate(url)` only if same-origin/relative · `push-received` → toast (+inbox invalidate) · `sw-version`/`log` → log only. `sendToSw(msg: PageToSw)` posts to `navigator.serviceWorker.controller` (returns `false` when none) and logs it.

**Tab sync** (`src/lib/tabs`): per-tab id in `sessionStorage` (also sent as `X-Tab-Id`); `BroadcastChannel('outpost-tabs')` (falls back to `storage` events; feature-detected). Messages: `invalidate {key}`, `session-changed`, `settings-changed`, `presence`. Presence every 5 s `{tabId, version, buildId, controller: scriptURL|null, visibility, at}`, expire after 12 s → `useOpenTabs()`. Mutations call `broadcastInvalidate` when lab setting `tabSync` is on; receiving tabs invalidate.

**Version/deploy watcher** (`src/lib/version`): `useVersionStatus()` → `{ running: {version, buildId, builtAt}, server: VersionInfo|null, deployed: {version, buildId, builtAt}|null, apiMismatch: number|null, skew: 'none'|'update-available'|'update-required'|'api-mismatch', newDeploy: boolean, chunkLoadFailed: boolean, lastCheckedAt }`. Polls `/api/version` and `/version.json` (`cache: 'no-store'`) every `deployWatchSec`, on focus and on reconnect. `update-required` = running < `minClient`; `update-available` = running < `latestClient`; `newDeploy` = deployed `buildId` ≠ running `__BUILD_ID__`. These are **website-level** update signals; the service-worker update signal is separate (`usePwaStore.updateAvailable`) — the Lab shows both side by side because real apps have both.

**Data layer** (`src/lib/queries`): `qk` key factory · `endpoints.ts` typed fetchers (app + lab + push + bench) returning `ApiResult<T>` · hooks: `useDispatchFeed(filters)` (infinite), `useDispatch(id)`, `usePatchDispatch()` (optimistic across detail + every cached feed list + inbox; `If-Match` from the cached rev; rollback on error; on `conflict` refetch + toast; on `unauthorized` open the clock-in prompt), `useCreateDispatch()`, `useInbox()`, `useMarkAllRead()`, `useStations()`, `useStation(code)`, `useSignal({pollMs})`, `useHandbookIndex()`, `useHandbookChapter(slug)`, `useDigest(since)`, `useSession()`, `useClockIn()`, `useClockOut()` (+ `sessionPrompt` store `{open, reason}` the shell renders a dialog for), `useBench(strategy,key)`, `useBumpBench()`, lab: `useLabState()`, `useLabTruth()`, `useUpdateChaos()`, `useSpawnWire()`, `useUpdateWire()`, `useUpdateRelease()`, `useSetHeaderProfile()`, `useSessionControl()`, push: `usePushVapid()`, `usePushSubscriptions()`, `useSendPush()`. Plus `src/features/inbox/useBadgeSync.ts` — effect hook that calls `callSeam('badge.set', …, {quiet:true})` whenever `InboxSummary.unread` changes (and clears at 0), and `useUnreadCount()`.

**Lab feed** (`src/lib/lab/feed.ts`): ref-counted `useLabFeed()` opens `EventSource(API.lab.events)` while any lab page is mounted, preloads `GET /api/_lab/log`, exposes `{ status: 'connecting'|'open'|'reconnecting'|'closed', serverLog: RequestLogEntry[] (ring 500, deduped by seq), labState, wireEvents }`, reconnect with backoff, reports nothing to the error centre (it's instrumentation) but exposes its own status.

## Design system (`src/ui`, barrel `src/ui/index.ts`)

Button (variants: primary/ghost/danger; sizes; loading), IconButton, LinkButton, Tag, **SeverityStamp**, StatusDot, Plate (panel with corner marks, optional index number + title + actions), Field/Input/Textarea/Select/Switch/Segmented/Checkbox, Tabs, DataTable primitives (ledger style), KeyValue, CodeBlock/JsonView (collapsible), Dialog (focus-trapped), Drawer, Toaster (renders `useToastStore`), EmptyState, **ErrorState** (takes `AppError`, shows `userMessage`, kind stamp, Retry if retryable, collapsible technical detail + "what this teaches"), Skeleton, **Loader** ("signal bars" stepped animation), PageHeader, FieldNotes (lab explainer block), Stat, Timeline/LogList, Kbd, **ProvenanceChip** (takes `ResponseMeta | undefined`; source badge + server age + duration; expandable popover with all meta), CopyButton, Disclosure, Pager/LoadMore, Meter (ledger-style segmented bar), Sparkline (inline SVG), plus `icons/` and a `Logo`. All themeable purely from tokens; all keyboard accessible.
