# Handoff: Outpost PWA learning project

Living context document. Read this first in a new session, then `docs/LEARNING.md` for the exercise being worked on. It is updated at the end of every exercise (see "How to update this file"). Last updated: Exercise 4 validated by the user and committed (2026-10-10).

## 1. What this project is

Outpost is a finished React 19 + TypeScript website (field-station dispatch log) with a small Node/Express backend and a "Lab" section that makes caching, updates, sync and errors observable. It contains **no PWA layer**. The user is learning PWAs by writing that layer themselves, with Claude doing the implementation and teaching.

The sixteen exercises are in `docs/LEARNING.md`. Reference material: `docs/CONTRACTS.md` (URL map, headers, outbox and push formats, message protocol, chaos presets), `docs/ARCHITECTURE.md` (spec and conventions), `docs/STATUS.md` (what exists; note its claim that CONTRACTS.md and LEARNING.md were never written is stale, they exist), `README.md`.

What Claude may write: `public/sw.js` (and other `public/` files), `public/manifest.webmanifest`, `src/pwa/*`, and the `<link>` hooks in `index.html`. What stays untouched unless a side effect forces it (then flag it and ask): `shared/`, `server/`, the website under `src/features`, `src/shell`, `src/lib`, `src/ui`, and the Lab under `src/lab`.

## 2. How the user wants to work (standing rules)

The user runs the server and the browser. Claude edits files and may make requests with curl.

- `npm run pwa` is running on `http://localhost:4000` and is the only server used for testing. Never test on `:5173` (a different origin, a separate registration).
- Claude never rebuilds `dist/` itself unless asked. It tells the user when to rebuild: run `npx vite build` in a second terminal (the server reads `dist/` on every request; no restart). Every change to `public/sw.js`, `src/pwa/*` or `src/` needs a rebuild. `dist/` is gitignored.
- Browser: Chrome with DevTools (Application tab).
- One exercise at a time, started only when the user says so ("start ex1", "start ex2").

### How each exercise runs (changed 2026-10-09: there is no break-it phase any more)

1. **Briefing** (no code, no commit): what to do, concepts touched, pages and Lab instruments affected, the site's current behaviour before the change, and when to rebuild.
2. **Implementation, in one message**: implement beyond the doc (check other callers, the store, observers, `index.html`, side effects). Then explain **every file changed, and everything changed in it**. For every piece of code that exists to prevent a future failure, say what the failing scenario is and how the code resolves it (this is what the user kept asking for: "how is our code safe from that"). One commit per exercise, with the handoff document updated in it.
3. **Validation scenarios, in the next message**: numbered scenarios to test and validate what was implemented (see the format rules below). The user's "Continue" afterwards means everything matched.

The user asked to skip all "breaker" code and the break-it phase. Do not write deliberate breakage, switchable flags or break commits. Failure scenarios belong in the explanation (what fails, how the code resolves it) and, where they can be provoked with the existing Lab (chaos presets, DevTools Offline), in the validation scenarios.

### Format rules for scenario write-ups

- Every scenario is numbered, in **one flat list** (never split into modules or groups).
- Each scenario is **one interleaved sequence**: every step is immediately followed by "You see:" (what appears, on which Lab page, plate or DevTools panel) and "Why:" (the code or browser concept responsible). Never list all the steps first and the expected results in a separate block; the user cannot tell which step produced which result.
- **Every command is complete and copy-pasteable, every time:** the full `localStorage.setItem('key', 'value')` line, the full Console expression, the full terminal command. Never "set the flag" or "set no-validation".
- Exact UI path every time: the URL and the exact Lab page and plate or button (for example "Lab → Chaos → Presets → All clear", never just "the simulator").
- **The explanation style the user confirmed works (2026-10-09, "keep that thing up"):** explain the WHOLE file, for a total beginner, in this order: (1) a short plain description of the file, with terms shown through real values (a real request, a real response with status/headers/body, a real cache box); (2) the cast: the actual files, URLs and sizes, named for real; (3) a before/after listing of what is stored; (4) **an indented call tree of who calls whom** (event -> function -> helpers, with counts), the single most useful part; (5) one real value followed through the helpers step by step; (6) real requests traced through the decision logic. Never a table for explaining code. Failures only inline where real.
- **Explain, do not just list.** Explain every file and every change in it. For each guard in the code, name the failure it prevents and how the code prevents it. Never describe a failure without showing how this project's code is safe from it.
- Say when to rebuild. Include a debug guide for UI + Lab + DevTools.
- Do not ask the user to report per-scenario results when they have said everything matched. **The user's word "Continue" means everything went as expected and to move to the next step. They will say if anything differed.** Asking for confirmation they have already given wastes their time. Mark only genuinely unknowable browser behaviour as "you confirm", and sparingly.
- Open handover messages with one line naming the audience when the thing produced is for someone else.

### Commit rules

- Never add a `Co-Authored-By` line (this overrides the default attribution reminder).
- Commit messages carry a descriptive summary in the body of what was done and why, for later reference.
- Commit only when the user asks (or says "Continue" after validating). One implementation commit per exercise. No break or revert commits.
- History was rewritten once on 2026-10-09 (before anything beyond `0d61811` was pushed) to drop the ex1 break, its revert and the ex2 break commits. A local backup branch `backup/ex2-with-break-commits` holds the old history; it is safe to delete. `origin/main` has `cde90b4` and `0d61811`; check `git log origin/main..main` before any history edit, and never force-push without asking.

## 3. Environment facts

- Repo: `/home/himanshu.sorathiya@simform.dom/Downloads/WebDev/Projects/Sessions/PWA`, branch `main`. Node 24. Scratchpad for temp files is under `/tmp/claude-369203610/.../scratchpad`.
- Commands: `npm run typecheck`, `npm run lint` (ignores `public/`), `npm test` (vitest, includes `src/**/*.test.ts`), `npm run pwa`, `npx vite build`, `npm run release` (bumps the version, rebuilds).
- Claude's own checks after code changes: typecheck, lint, full tests. A build into a scratch directory (`npx vite build --outDir <scratch> --emptyOutDir`) can prove `public/` files are emitted without touching the user's `dist/`.
- Server inspection from the shell (all under `/api/_lab/*`, never chaos'd): `GET /api/_lab/log?since=0` (request log, ring of 500; shows `dest`, `tab`, `notes`, status 0 = socket dropped), `GET /api/_lab/state`, `GET /api/_lab/chaos`, `POST /api/_lab/chaos/preset/all-clear`, `POST /api/_lab/reset`.
- Test baseline: 615 tests at the start, 639 after exercise 1 (45 files), 675 after exercise 2 (47 files; 715 after exercise 3; `scripts/**/*.test.ts` is now in the vitest include).
- **Never stop processes with `pkill -f` or `killall` by pattern.** The user's `npm run pwa` server (`tsx server/index.ts`) matches the same pattern as any scratch server and was killed once this way. If a scratch server is needed, start it on another port with `& echo $!` and kill that exact PID, or prefer the vitest sandbox. After any server work, check `curl localhost:4000/api/ping`. If the user's server was lost, they restart with `npm run pwa` (it also rebuilds `dist/`).
- Product conventions in `src/`: strict TS, no `any`, no `@ts-ignore`, no `console.log`, no emoji, `import type` for types. `public/` is outside lint and type checks, is not bundled and cannot import `shared/*.ts`.

## 4. Progress

| # | Exercise | Status | Commits |
|---|---|---|---|
| 1 | Register the worker, read its lifecycle | **Done** (on `origin/main`) | `0d61811` |
| 2 | Install, activate, precache the shell | **Done**, validated by the user in 16 browser scenarios; on `origin/main` | `f686a52` |
| 3 | Cache-only handbook, `delta` miss | **Done**, validated by the user in 16 browser scenarios; the user pushed up to `ac73922`, this commit may still be local | the commit titled `ex3: ...` (a commit cannot contain its own hash; find it with `git log --oneline --grep=ex3`) |
| 4 | Cache-first media and assets | **Done**, validated by the user in 17 browser scenarios; local, not pushed | the commit titled `ex4: ...` (find it with `git log --oneline --grep=ex4`) |
| 5 | Network-first with timeout | | |
| 6 | Stale-while-revalidate, `cache-updated` | | |
| 7 | Network-only done properly | | |
| 8 | Offline navigation, chunks | | |
| 9 | Versioned caches, cleanup | | |
| 10 | The update flow | | |
| 11 | Background Sync outbox | | |
| 12 | Push, `notificationclick` | | |
| 13 | Badge and consistency | | |
| 14 | Periodic Background Sync | | |
| 15 | Manifest, install, share, shortcuts | | |
| 16 | Break it on purpose, handle it | | (the doc's own exercise about chaos; the user's "no breakers" rule is about extra break code, so ask before deciding how to treat this one) |

Git log: `cde90b4` initial project setup → `0d61811` ex1 → `f686a52` ex2 → `ac73922` docs → ex3 → ex4 (find the ones without a hash with `git log --oneline`).

## 5. What exists now

### Exercise 4: cache-first for media, assets and the bench route (commit titled `ex4: ...`)

Decisions the user accepted ("Continue" on the briefing defaults):
- Three runtime caches: **`media-v1`** (`/media/*`, capped at `MEDIA_LIMIT = 30`, oldest stored first, which is FIFO not LRU: a hit does not move an entry), **`assets-v1`** (every `/assets/*` the page loads that is not in the shell, no cap), **`api-v1`** (`/api/bench/cache-first/:key`, no cap; later API strategies reuse it).
- `/assets/*` reads **`shell-v1` first**, then `assets-v1`, then the network; only the network answer is written, to `assets-v1`. The old `PRECACHED` set and `fromPrecache()` were removed (all 18 shell files are `/assets/*`, so the rule covers them). **Consequence for Exercise 8:** any route visited once online now works offline (its chunk is in `assets-v1`); the failure that remains is "never visited AND offline".
- `/favicon.svg`, `/icons/*`, `/version.json`, `/sw.js` stay untouched (no hash). A navigation to a media URL typed into the address bar stays untouched. A request with a `Range` header is left to the network.

Code (`public/sw.js`): `CACHE_FIRST` is a list of rules (`matches`, `readFrom`, `writeTo`, `limit`, `accepts`); `lookup()` tries the caches in `readFrom` order, an unreadable cache counts as a miss; `cacheFirst(event, request, rule)`: hit returns `stamped(hit, 'cache', 'cache-first', cacheName)`; a miss goes to `fetch(request)` (a network failure is rethrown, no invented answer); the answer is stored only if status is 200, `Content-Length` is not `0` and `rule.accepts` agrees, from `response.clone()` inside `event.waitUntil(store(...))`; the page gets `stamped(response, 'network', 'cache-first', writeTo)` (`X-SW-Source: network` is read by the page as "SW network"). `accepts`: media `image/*`; assets a positive allow-list (`text/javascript`, `text/css`, `application/javascript`, `application/wasm`, `font/*`, `application/font-*`, `image/*`), so an empty 200 with a JSON type or a captive portal is refused; bench entry JSON whose `strategy` is `cache-first` and `key` equals the URL's key. `store()` swallows and `console.warn`s any failure (quota, revoked cache): the page already has its answer. `trim(cache, limit)` deletes the oldest keys beyond the cap after each `put`. `stamped()` is shared with `cacheOnly()` (refactor). The bench pattern is `^/api/bench/cache-first/[^/]+$`, so `/bump` and an empty key are not matched.
- Tests: `scripts/sw.test.ts` 64 -> 104 (fake cache gained `keys`/`delete`, a quota switch and a body that fails half way). Typecheck, lint and all 757 tests pass. Mutation check: removing the status/type check fails 16 tests, removing the cap fails 1.
- Not verified without a browser (user validates): the real `<img>` request path, that `cache.keys()` insertion order holds in Chrome, the Resources "Served from" labels.

### Exercise 3: cache-only handbook and the `delta` miss (commit titled `ex3: ...`)

- `public/sw.js` now has two buckets: `shell-v1` (shell and hashed shell files) and **`precache-v1`** (API data stored at install and answered cache-only). `precache()` downloads and validates everything first (shell, shell files, handbook, bench), opens the buckets only after that (a failed install leaves no bucket at all, not even an empty one; the exercise 2 version left an empty `shell-v1`), then writes.
- Precached API set: `/api/handbook`, every `/api/handbook/<slug>` named by the index (8), and `/api/bench/cache-only/{alpha,beta,gamma}`. **`delta` is deliberately absent.** Validation: status 200, `application/json`, the body parses as a JSON object, the index has an edition and chapters, each slug matches `^[a-z0-9-]+$`, every chapter's `slug` equals the listed one and its `edition` equals the index's, each bench entry has `strategy: 'cache-only'` and the right `key`.
- Stored copies get `X-SW-Cached-At` (stamp at write time); the server's `X-Served-At` is kept so a stored copy shows its true age.
- `fetch`: `isCacheOnly(pathname)` is the handbook index, `/api/handbook/*` (boundary on the slash, so `/api/handbook-archive` is not matched) and `/api/bench/cache-only/*`. GET only. Answered by `cacheOnly(url)`: exact URL (query string included, no `ignoreSearch`) looked up in `precache-v1` only; a hit is returned with `X-SW-Source: cache`, `X-SW-Strategy: cache-only`, `X-SW-Cache: precache-v1`; a miss, or an unreadable cache, is `cacheMiss()`: 504 with `X-SW-Source: cache-miss` and a JSON body in the server error shape (`code: 'unavailable'`, message, `requestId: 'sw-...'`), no `X-Served-By`. Never touches the network.
- `.then`/`.catch` chains in code written for the exercises were replaced by async/await (install and message handlers in `sw.js`, one test). The finished website, Lab and server (37 files) were left alone.
- Tests: `scripts/sw.test.ts` grew to 64 (API fixtures, 12 install-failure cases, stamping, edition change only via a new install, cache-only hits and misses, prefix safety, methods, unreadable cache). Verified over real HTTP against a scratch server: install OK with 12 API + 21 shell entries; fails with no bucket left under captive-portal, corrupt-json, empty-body, rate-limited, stale-chunks, hard-down; under flaky (30 percent of `/api` 500) nearly every install fails because it makes 12 API requests and there is no retry inside install.
- Known limits: the handbook page, chapter page and Bench page are lazy route chunks, so an offline reload of `/handbook` still cannot draw the page (exercise 8); in-app navigation works once those routes were visited online. The stored handbook only changes with a new worker install, i.e. every rebuild (`npx vite build`); "Bump handbook edition" in Lab -> Server -> Release simulator leaves the stored copy at the old edition until then. A transient failure during install fails the whole install (the old worker stays); the browser retries on the next navigation or "Check for update".

### Exercise 2: install, activate, precache the shell (commit `f686a52`)

Design decisions, and why:
- **The precache is the app shell only, 18 files (about 1.33 MB):** what `/index.html` points at (entry script, four preloaded chunks, two stylesheets) plus the 11 font files those stylesheets point at. The lazy route chunks (about 85 more files) are deliberately **not** precached. First plan was to precache all ~104 hashed files; the user objected ("how can we go in fail mode during offline?") and was right: Exercise 8 needs uncached routes to show "Loading failed" offline, and Stale chunks only bites on files not cached. Exercise 8 adds the route chunks.
- **`public/sw.js` is a template.** Two tokens (`'__BUILD_ID__'` and `/* __PRECACHE_URLS__ */ []`) are replaced in `dist/sw.js` after every build by the `outpost:service-worker` plugin in `vite.config.ts` (`closeBundle`, reads the finished `index.html` and CSS from disk). Reason: the browser decides "new worker?" by comparing `sw.js` bytes; if the list and build id lived elsewhere, a deploy would leave `sw.js` identical and nothing would ever update. Consequence: **every `npx vite build` is a new worker version**, so rebuilds now exercise the update flow (skipWaiting makes it take over at once until Exercise 10). Under `npm run dev` the tokens are not replaced (empty list, shell only).
- `scripts/sw-inject.ts`: pure `injectServiceWorker()` (throws if a token is missing, so a broken template fails the build), `shellUrls()`, and `requireShellUrls()` (fails the build when no shell files are found, so a changed `index.html` format cannot silently ship a worker that precaches nothing). Tests in `scripts/sw-inject.test.ts` (14) and `scripts/sw.test.ts` (22, runs the real `public/sw.js` in a `node:vm` sandbox with fake `caches`/`fetch`/`self`). `vite.config.ts` imports `./scripts/sw-inject.ts` with the extension and `tsconfig.node.json` got `allowImportingTsExtensions` (without it Vite warns about native config loading on every build).
- Worker behaviour: `install` fetches `/index.html` once (`Accept: text/html`, `cache: 'reload'`) and stores it under `/`, `/index.html` and `/offline` in cache **`shell-v1`**, fetches the 18 files (`cache: 'reload'`), validates everything first (status 200; HTML only where HTML is expected, so a captive portal cannot be stored as a script), then writes; any failure rejects the install; `skipWaiting()` runs after success. `activate` calls `clients.claim()`. `fetch`: non-GET, cross-origin, and anything not listed is left to the browser; a navigation to an app route (no extension, not `/api/` or `/media/`) is network-first with the stored `/index.html` as fallback on failure (no timeout yet, so Lie-fi hangs: Exercise 5/8); a precached `/assets/*` URL is cache-first. `message` `get-version` replies `sw-version` with the build id and cache names (extra, makes two worker versions distinguishable from Lab -> Worker -> Send get-version).
- Doc discrepancy found: LEARNING.md Exercise 2 says an offline reload paints the shell but its Do list has no `fetch` handler, which cannot work. A minimal handler was added so the exercise's "Done when" holds. Exercises 4 and 8 refine it.
- Expected behaviour offline after Exercise 2: reload of `/log` paints the app frame, the route area shows "This screen did not load" (its lazy chunk is not cached), data screens fail on their API calls. Not served offline: favicon, icons, `/version.json`, all `/api/*`.
- Verified without a browser: typecheck, lint, 675 tests; a scratch build has no tokens left, the build id baked in, 18 entries, no lazy chunks, and two builds of the same source give different `sw.js` bytes; the built worker's install was run against a real server (scratch instance on :4010) over HTTP: OK (21 entries), fails with 404 under Stale chunks and under Hard down, fine under the HTTP cache trap profile.

### Exercise 1: what exists (commit `0d61811`)

Files:

- `public/sw.js`: inert worker, empty `install` and `activate` listeners, no `fetch`. Scope `/` because it is served from the root.
- `src/pwa/sw-state.ts`: `describeSlots(slots)`, a pure function. Priority installing, then waiting, then active (`activating` stays `activating`, `activated` becomes `active`), else `none`. This is the same order Lab → Worker's comparison plate uses (`src/lab/observers/worker-compare.ts`), so the store and the plate agree.
- `src/pwa/registration.ts`:
  - `register()`: returns quietly when `serviceWorker` is missing; registers `/sw.js` with default options; `watch(reg)`; on rejection, re-syncs the store from the browser (does not invent an `error` state) and rethrows.
  - `watch(reg)`: `updatefound` once per registration, `statechange` once per worker, guarded by WeakSets so repeat `register()` calls (boot, then Lab → Errors "Call registration.register") do not double listeners. A `redundant` worker triggers `syncFromBrowser()` because a failed first install removes the registration.
  - `findRegistration()`: `getRegistrations()` each time, longest scope containing `location.href`, else the first. Not a module variable, because a reload empties module state.
  - `unregister()`: finds, unregisters, sets the store to none. `checkForUpdate()`: `reg.update()`; the bare `TypeError` it raises for an unreachable script is rethrown as a `NetworkError` DOMException so the page files it as kind `network`; nothing registered gives `InvalidStateError`; no API gives `NotSupportedError`.
  - `syncFromBrowser()` and `startBrowserSync()`: re-read on window focus and `visibilitychange`, because the browser raises no event for DevTools Unregister or Clear site data.
  - `applyUpdate()` is **still a stub** on purpose (exercise 10).
- `src/pwa/boot.ts`: `startBrowserSync()`, wait for the window `load` event (so a later precaching worker does not compete with the first paint), then `registration.register()`. `boot` is called through `callSeam('boot', ..., { quiet: true })` from `src/main.tsx`; errors are filed silently in Lab → Errors. One `TODO(you)` remains for the other initial state reads (push subscription, queue, periodic tags).
- `src/pwa/registration.test.ts`: 24 tests against a faked `navigator.serviceWorker`.

Deliberately not done in exercise 1 (expected, not bugs):
- `updateAvailable` stays `false`. With a waiting worker behind a controlled page, Lab → Worker shows an expected Mismatch on that row until exercise 10.
- No `clients.claim()`, so the page that registers the worker is uncontrolled until its next load (exercise 2). The strip shows an "Uncontrolled" marker.
- `registration.register` seam tile only moves when something calls it through `callSeam` (the Lab → Errors → "Call registration.register" button). Boot calls it directly, as the doc says.

## 6. Things learned along the way (browser and app behaviour)

Confirmed by the user in Chrome:

- A tab open before a rebuild keeps running the old bundle (no registration code) and its lazy chunks 404, because `vite build` deletes old hashed files. Reload it.
- First load after registering: "Not controlling this page"; the next normal reload: controlled; Shift-reload: uncontrolled again while the registration stays.
- The browser's `sw.js` update fetches do **not** appear in the page's DevTools Network panel. They show in the server request log (Lab → Network → Server, or `GET /api/_lab/log`) with `dest=serviceworker` and no tab id: 200 when the bytes changed, 304 (`etag-304`) when not, status 0 under Hard down. The browser also re-checks `sw.js` on navigations within scope, not only on `registration.update()`.
- Hard down destroys every socket except `/api/_lab/*`, so a lazy Lab page not visited beforehand fails with "This screen did not load", and the Chaos page's own **All clear** button may be unreachable. Recovery: `curl -X POST http://localhost:4000/api/_lab/chaos/preset/all-clear`. Habit: visit the Lab pages needed (Chaos, Errors, Network) before turning chaos on. The error centre is in memory and is lost on reload.
- A failed update check under Hard down originally filed kind `unknown` (bare TypeError); fixed in `checkForUpdate` as described above.
- Error classification: `callSeam` turns a thrown DOMException name into a kind: `NotSupportedError` → unsupported, `NotAllowedError`/`SecurityError` → permission, `QuotaExceededError` → quota, `AbortError` → aborted, `NetworkError` → network, other names (such as `InvalidStateError`) and unrecognised TypeErrors → unknown.
- Findings from the exercise 1 break-it run (the break code is gone, the knowledge stays; all matched predictions): a worker script that does not parse makes `register()` reject; a first install that fails removes the registration after `register()` resolved; a failed update leaves the old worker active; a naive "registered, active" store write is wrong and the focus/visibility sync would hide that bug in a real app; a `/lab/` scope leaves `/log` uncontrolled and control is fixed per page load; treating "installed" as an update on a first install raises a pointless toast and a Mismatch; an `unregister()` that does not reset the store leaves the strip claiming a registration; awaiting `navigator.serviceWorker.ready` before registering never resolves on a first visit and the `boot` seam tile never appears (a seam call is logged only when it settles).

Exercise 2 design lesson: do not precache what later exercises need to fail. Precache is a decision about which failures you keep.

Open observation carried forward: `registration.register()` failures (syntax or evaluation error) surface as a bare `TypeError` and are filed as kind `unknown`. The same classification gap was fixed for `update()` only. A follow-up commit could map it; the user has not asked for it yet.

## 7. Notes for the next exercise (Exercise 5: network-first with a timeout, dispatches)

From `docs/LEARNING.md`:

- Routes: `GET /api/dispatches`, `GET /api/dispatches/<id>`, `GET /api/inbox/summary`, `GET /api/digest`. Try the network with a timeout (about 3 s; `apiFetch` itself gives up at 10 s, Lab -> Query -> Settings -> Request timeout, so the worker must be shorter). Answer with a 200 whose `Content-Type` is JSON and store a clone (cache `api-v1`, the name Exercise 4 already uses for the bench route); otherwise answer from `caches.match(request)`; if nothing is stored let the network failure through.
- Stamp what is returned: `X-SW-Source: network` or `fallback` (the stored copy), `X-SW-Strategy: network-first`, `X-SW-Cache`, and `X-SW-Cached-At` at write time. The page then shows "Stored copy" notices (needs `cache` or `fallback` stamps). `stamped()`, `stampForStorage()`, `store()`/`trim()` helpers already exist in `public/sw.js`; reuse them.
- Decide: `/api/dispatches` has query strings (cursor, filters, `limit`); the exact URL is the key (as in Exercise 3), so each page and filter is its own entry. Decide whether to cap it. Mutations are non-GET and are left alone. Truncated feed (`/api/dispatches` sends 200 then the socket dies): the failure arrives while the body is read, so the clone given to `store()` rejects and the page must fall back; think about whether the worker should read the body before answering (the Exercise 4 `store()` catch already keeps a bad write from reaching the page).
- Lab pages: Chaos -> Presets -> Lie-fi (4 to 9 s delay) and Chaos -> Probe (target Dispatch list, 15 s, Fire 5 times); Bench -> Scenarios -> Server down (network-first row: warm copy, "SW fallback") and Stale after bump (network-first row FRESH).
- Known interaction: Exercise 2's `navigate()` has no timeout; Lie-fi delays `/api` only, not navigation, so Exercise 5 is about API calls. Exercise 8 handles navigation timeouts.

## 8. How to update this file

At the end of each exercise (the briefing needs no update; the implementation commit includes this file):

1. Move the exercise's status in the table in section 4 and add its commit hashes.
2. Replace section 5 with the current set of PWA files and design decisions (keep older exercises' summaries short, one paragraph each, under a "Previous exercises" heading once section 5 grows).
3. Add new browser or app behaviours the user confirmed to section 6.
4. Rewrite section 7 for the next exercise.
5. Update the test baseline and the "Last updated" line at the top; record any new standing rule the user gave in section 2.
6. Include this file in the same commit as the phase it describes (unless the user says otherwise).
