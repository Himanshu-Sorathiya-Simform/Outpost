# Status

Current state of Outpost, written after the final integration pass. Factual and terse. The spec is `docs/ARCHITECTURE.md`; this file says what exists, how to run it and where it falls short.

Outpost is a complete ordinary website (React + TypeScript, Node API with fault injection, an instrument section called the Lab). It contains **no PWA implementation**. Every PWA feature sits behind a stub in `src/pwa/` that rejects with `PwaNotImplementedError`, and the website shows a muted "not wired up yet" state for each one.

## Verified state

Checked on the integration pass:

- `npm run typecheck`, `npm run lint` clean. `npm test`: 44 files, 615 tests pass. `npm run build` succeeds (largest chunks: `index` 259 kB, `ui` 163 kB, `contracts` 99 kB; every page is its own lazy chunk).
- Production server (`dist` + API) smoked with Playwright and system Chrome across every route (29 URLs, including a station, a dispatch, a handbook chapter, the share target and the protocol handler, plus the 404 page) at 1280x900 and 360x800: no console errors or warnings, no page errors, no horizontal scroll, every page has an `h1`.
- `npm run dev` (Vite :5173, API :4000, proxy answering) and `npm run pwa` (build, then the server on :4000 serving `dist`) both start cleanly.
- Source greps are clean: no `console.log`, `any`, `@ts-ignore`, emoji, `lorem` or placeholder tokens; the one `TODO` is in `src/pwa/boot.ts`, which is the learner's.
- `public/` holds `favicon.svg` and `icons/*.png` only. No `sw.js`, no manifest, and `index.html` has the manifest and apple-touch-icon links only inside a comment as exercise hints. `dist/` has `version.json` and no worker or manifest. `/sw.js` and `/manifest.webmanifest` answer 404 from the server.
- Nothing outside `src/pwa` calls `serviceWorker.register`, `Notification`, `showNotification`, `setAppBadge`, `navigator.share`, `sync.register`, `periodicSync.register` or `pushManager.subscribe`, or listens for `beforeinstallprompt`. Hits for those names are copy and guide text, `callSeam('...', () => pwa.<area>.<method>())` arrows, or read-only observers (see "Read-only observers").

## Run

| command | what |
|---|---|
| `npm run dev` | Vite on :5173 with HMR, API on :4000 (`tsx watch`). `PORT=xxxx` moves the API and the Vite proxy target. |
| `npm run pwa` | `vite build`, then the server serves `dist` and the API on :4000 with production-like cache headers and SPA fallback. Use this for real PWA work. |
| `npm run build` | typecheck, then `vite build`. Every build gets a fresh `BUILD_ID` even with the same semver. |
| `npm run release` | `scripts/release.mjs`: bump the patch version (or `-- minor`, `-- major`) in `package.json` and the lock file, then build. For practising updates: leave one tab open, rebuild, reload the other. The running API keeps the version it started with. |
| `npm run icons` | regenerates `public/icons/*.png` from one SVG (sharp). No manifest is written. |
| `npm test`, `npm run lint`, `npm run typecheck` | as named. |
| `/kitchen.html` | design-system harness, Vite dev only (not part of the build). |

Environment: `PORT` (API, default 4000), `OUTPOST_DATA_DIR` (VAPID keys and push subscriptions, default `server/.data`), `OUTPOST_DIST_DIR` (served build), `APP_VERSION`, `BUILD_ID`, `VAPID_SUBJECT` (optional). Client globals: `__APP_VERSION__`, `__BUILD_ID__`, `__BUILD_TIME__`.

## What exists

### Product routes

| path | file |
|---|---|
| `/` | redirects to `/log` |
| `/log`, `/log/:id` | `src/features/dispatches/pages/{LogPage,DispatchPage}.tsx` |
| `/file`, `/drafts`, `/share-target`, `/handle` | `src/features/compose/pages/*` (compose with prefill, drafts and outbox, incoming share, protocol handler) |
| `/inbox` | `src/features/inbox/pages/InboxPage.tsx` |
| `/stations`, `/stations/:code` | `src/features/stations/pages/*` |
| `/signal` | `src/features/signal/pages/SignalPage.tsx` |
| `/handbook`, `/handbook/:slug` | `src/features/handbook/pages/*` |
| `/settings` | `src/features/settings/pages/SettingsPage.tsx` (operator, appearance, notifications, install, app updates, background refresh, badge, storage) |
| `/offline`, `*` | `src/shell/pages/{OfflinePage,NotFoundPage}.tsx` |

Shell (`src/shell`): app frame, left rail and mobile bar, 28 px telemetry strip, banners (offline, version gate), clock-in dialog, seam status, route error boundary.

### Lab routes (`src/lab`, phosphor-green accent)

`/lab` home with a learning path, then `environment` (capability matrix, display mode, manifest viewer and checklist, storage), `worker` (registrations, lifecycle timeline, controller, SW messages, store comparison), `caches` (Cache Storage explorer, `match()` tester), `bench` (five strategies side by side), `consistency` (server truth vs React Query vs Cache Storage), `network` (client log joined with server log), `chaos`, `server` (wire simulator, release simulator, header profiles, session control, push console), `queue` (seam call log, outbox, tabs, SW message protocol), `errors` (error centre and simulator), `query` (React Query cache explorer and settings). Each page opens with a Field notes block: what you are looking at, and what to try.

### The seam (what the learner fills in)

`src/pwa/*` are stubs behind `callSeam(feature, fn, { quiet? })`. Seam features, with the file to edit: `registration.{register,unregister,checkForUpdate,applyUpdate}` (`registration.ts`), `install.prompt` (`install.ts`), `notifications.{permission,requestPermission,subscribePush,unsubscribePush,getSubscription,showLocal}` (`notifications.ts`), `sync.{queueDispatch,listQueued,removeQueued,flushNow}` (`sync.ts`), `periodicSync.{isSupported,register,unregister,list}` (`periodic-sync.ts`), `badge.{set,clear}` (`badge.ts`), `share.{canShare,share}` (`share.ts`), plus `boot` (`boot.ts`, called once after first render). `notifications.permission`, `periodicSync.isSupported`, `share.canShare` and `boot` answer without throwing; everything else throws `PwaNotImplementedError`. The full table, with live outcomes, is in Lab / Queue.

The page side of the worker protocol (`shared/sw-protocol.ts`, `src/lib/bridge/sw-messages.ts`) is implemented: the page validates and logs every message from the worker and the `outpost-sw` BroadcastChannel and reacts to it (invalidate by URL, navigate to same-origin URLs, toast on push).

### Read-only observers (allowed, not PWA code)

`src/lab/observers/*` and `src/lib/bridge`: `navigator.serviceWorker.getRegistrations` and worker events, `caches.keys/has/match`, `navigator.storage.estimate/persisted`, capability detection, manifest fetch and validation, `pushManager.getSubscription`, `periodicSync.getTags`. `src/features/handbook/useStoredOffline.ts` reads Cache Storage without fetching. Two user-triggered actions are not read-only and are deliberate Lab tools: deleting a cache or entry in the Cache explorer, and the Persist button in Environment (`navigator.storage.persist()`).

## Server (`server/`)

Express 5, in memory, seeded PRNG. Files: `index.ts` (app and `start(port)`), `meta.ts` (request id, headers, cache policy, same-origin write check), `chaos.ts`, `log.ts`, `events.ts` (SSE), `lab.ts`, `push.ts`, `static.ts`, `store.ts`, `session.ts`, `media.ts`, `runtime.ts`, `util.ts`, `routes/{api,bench,media}.ts`, `seed/`. Tests: `server/server.test.ts`.

- Routers are case-sensitive and strict (`/API/x` and `/api/ping/` are 404). Every error response is `Cache-Control: no-store`.
- Unsafe requests with an `Origin` host different from `Host` get 403 (no `Origin` passes).
- Single-dispatch ETag is `W/"<id>-r<rev>"`, with `-drift` while schema drift is on. `If-Match` accepts either.
- Caps: 1000 dispatches (oldest evicted with their idempotency keys), 500 sessions, 50 push subscriptions (429 beyond). The seed holds 64 dispatches, ids `dp-000001` to `dp-000064`.
- Default chaos rules include `empty-body` and `slow-body`, so all 10 chaos modes have a one-click rule. `POST /api/_lab/chaos/preset/all-clear` restores normal behaviour.
- After `POST /api/_lab/reset`, seeded ids repeat with `rev 1` and re-based `filedAt`; a client holding a pre-reset ETag gets 304. Hard-reload after a reset.
- `HEAD /api/signal` bumps `seq`; `HEAD /api/bench/...` bumps `hits`. Dark stations report `rssiDbm -128, snrDb 0, latencyMs 0`: branch on `status === 'dark'`.
- Chaos `status` injection always answers with a JSON `ApiErrorBody`, also under `/assets/`.
- `/sw.js`, `/manifest.webmanifest` and `/version.json` get the cache policy of their header profile even though the first two do not exist yet.
- Push is unauthenticated and sends to any https endpoint: local learning app only. VAPID keys and subscriptions persist in the data dir; everything else is lost on restart.

## Client foundation (`src/lib`)

Import from `@/lib` (barrel), except queries (`@/lib/queries`). `startFoundation({ navigate })` starts global error handlers, appearance, query-settings sync, net monitor, resource log, tab sync, version watcher and the SW message bridge, and returns a disposer. `main.tsx` calls it once.

| area | main exports |
|---|---|
| `api` | `apiFetch` (zod-validated, throws only `AppError`, returns `{ data, meta }`), `useNetLog`, `decideSource`, `ResponseMeta`, `ResponseSource` |
| `errors` | `AppError`, `toAppError`, `errorCenter`, `useErrorCenter`, `ErrorBoundary`, `installGlobalErrorHandlers` |
| `net` | `useNetStatus`, `probeNow`, `useResourceLog`. Reachability counts a response carrying `X-Served-By` as reached, whatever its status. |
| `query` | `queryClient`, persistence (IndexedDB via idb-keyval, off by default), `usePersistStatus`, `corruptPersistedCache` |
| `settings` | app settings (theme, density) and lab settings (`networkMode`, `rqBuster`, `retries`, `requestTimeoutMs`, `showProvenance`, ...), cross-tab synced |
| `storage` | `safeLocal`, `safeSession`, `readJson`, `writeJson`, `createPersistedStore` (tolerate disabled, full or corrupt storage) |
| `tabs` | tab id, presence, `broadcastInvalidate`, `broadcastSessionChanged` |
| `bridge` | `callSeam`, `useBridgeLog`, `useSwMessageLog`, `sendToSw`, `safeNavigationTarget` |
| `version` | `useVersionStatus`, `checkVersionNow`, semver helpers; polls `/api/version` and `/version.json` |
| `lab` | `useLabFeed` (SSE: request log, lab state, wire events) |
| `notify` | `notify({ tone, title, body? })`, `useToastStore` (rendered by `<Toaster />`) |

Query layer (`@/lib/queries`): `ApiQuery<T>` is a TanStack result with a validated `data`, an `AppError | null` error and `meta` for `<ProvenanceChip>`. Reads: `useSession`, `useInbox`, `useDigest`, `useStations`, `useStation`, `useSignal`, `useHandbookIndex`, `useHandbookChapter`, `useDispatch`, `useDispatchFeed`, `useBench`, `usePushVapid`, `usePushSubscriptions`, `useLabState`, `useLabTruth`. Mutations: `usePatchDispatch` (optimistic across detail, feeds and inbox; 412 replaces caches and rejects `conflict`; 401 opens the clock-in prompt and the write is held and sent again after the next clock-in), `useCreateDispatch` (idempotency key per form), `useMarkAllRead`, `useClockIn`, `useClockOut`, the lab mutations, `useBumpBench`, `useSendPush`. `endpoints` holds one typed fetcher per route; `qk` the query keys. Hook tests need `// @vitest-environment jsdom` and use `src/lib/queries/test-harness.tsx` and `fake-server.ts`.

Provenance: `ProvenanceChip` shows a live age (age on arrival plus time since), ticking each second, and flags Stale from that live age. A 304 revalidation reads "HTTP CACHE 304" in the chip; `meta.source` for it is still `http-cache` (see known limits).

## Design system (`src/ui`, `src/styles`)

Import everything from `@/ui`; `import '@/styles'` once in `main.tsx`. Theme is `data-theme` on `<html>`, the Lab zone is `data-zone="lab"` on a wrapper, density is an app setting. Components: `Button, IconButton, LinkButton, Tag, SeverityStamp, StatusDot, Plate, Field/Input/Textarea/Select, Switch, Segmented, Checkbox, Tabs, Table primitives, KeyValue, CodeBlock, JsonView, CopyButton, Disclosure, Dialog, Drawer, Toaster, EmptyState, ErrorState, Skeleton, Loader, PageHeader, FieldNotes, Stat, Timeline/LogList, Kbd, ProvenanceChip, TimeAgo, LoadMore, Meter, Sparkline, Logo, Icon`, plus `cx` and the `format*` helpers.

Rules the reviews settled on: hit targets are at least 24x24; use the contrast-corrected ink tokens, never raw hex; `KeyValue` stacks a leader row for values over 28 characters; `LogList` switches to two lines under 34 rem of its own width; `ProvenanceChip` collapses to source and flag under 360 px; the native search-clear glyph is hidden in the design-system inputs.

## Known limits

Deliberate teaching traps (do not "fix"):

- With `rqBuster: 'none'`, persisted queries hydrate without re-validation. `gcTimeMin` below the 24 h persist `maxAge` erodes the persisted cache. The persister's 1 s throttle can lose the last write on unload.
- The server's `/api/ping` and chaos rules share the same matching, so a chaos `status` rule on `/api` also answers the probe.
- On the dev server, API revalidation answers 304 on most loads, so provenance chips read "HTTP CACHE 304" often. That is accurate.

Open items, none blocking:

- **Compose connectivity vs notice.** `answeredByServer` in `src/lib/net/status.ts` treats any response with `X-Served-By` as reachable, including a chaos-injected 502/503. The compose strip can say "Relay answering" above a "NOT SENT: relay is down" notice. Adding a `res.ok` check would also change what lie-fi and the unreachable state mean in the Lab, so it was left.
- `src/lib/api/provenance.ts` still reports source `http-cache` for a 304; only the chip relabels it. Lab pages that read `meta.source` say HTTP cache.
- Signal "last contact" (the server's sample time) and the offline banner's last contact (latest answered request) are different clocks and can differ by up to a second.
- Network page: the class filter still lists page-resource rows under SERVER ONLY (the tile count excludes them).
- The Inbox badge readout line wraps awkwardly in its 22 rem column at around 1100 px.
- Lab Field notes can leave an empty block under the explainer when the experiments column is taller. A Segmented control may scroll internally at 320 px with long labels.
- The optional version-gate text pointing at the Lab was not added (it would couple shell code to Lab storage keys). The forced-upgrade gate lift resumes on any `/lab` page.
- Not verified end to end for lack of a worker or a local https push endpoint: a CACHE row followed by a worker revalidation SERVER ONLY row (unit test only) and a push-service 404/410 prune. Worker timeline, cache and manifest behaviour was checked once in a scratch copy with a throwaway worker and manifest.
- Under a hard-down chaos state the Vite dev proxy returns 502, which Chrome logs to the console. Expected.
- Two failed patches on the same field can leave the second's optimistic value until the settle-time invalidation.
- `docs/CONTRACTS.md` and `docs/LEARNING.md`, listed in the architecture folder map, were never written; `shared/contracts.ts` and the Lab learning path stand in. There is no top-level README.
- `.review/` holds screenshots from the review passes and can be deleted.
