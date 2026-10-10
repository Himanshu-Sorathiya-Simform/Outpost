// What it holds:  every name, limit and timeout the worker uses, and above all the CATALOGUE OF CACHES: which bucket stores which files or
//                 API answers, who fills it, who reads it, and how big it may grow.
// What it means: Cache Storage is a set of named buckets of URL -> response. Nothing else in the worker may invent a bucket name; each
//                bucket is declared once, here, with what it is for. If you want to know "where does /api/stations end up?", read this file.
// Caching type:  none (this file only names things; the three types are in caching/).
// Caches touched: all of them, by name.
//
// Two caching TYPES fill the buckets (see caching/):
//   precache  - written once, at install, all or nothing.
//   runtime   - written while the app runs, after a miss or a background refresh.
//   on-demand - written because the page asked. Not used yet (see caching/on-demand.ts).
//
// ── The catalogue ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * shell-v1                                                                   TYPE: precache
 *   Stores:     the page itself, under three keys that hold the same HTML ('/', '/index.html', '/offline'), and the hashed files the app needs
 *               to run offline: the SHELL (entry script, preloaded chunks, stylesheets and font files, 18 files) and every WEBSITE ROUTE chunk
 *               with what it needs (/assets/LogPage-<hash>.js, StationsPage, HandbookPage, ChapterPage, InboxPage, SignalPage, SettingsPage,
 *               ComposePage, DraftsPage and so on, with their stylesheets and shared chunks; about 54 more files). The Lab's page chunks are
 *               NOT here: they are stored at runtime in assets-v1 when visited. The build lists everything in PRECACHE_URLS.
 *   Filled by:  install, once, all or nothing (caching/precache.ts).
 *   Read by:    navigation (the stored page when the network fails or is too slow, navigation.ts) and the /assets rule of cache-first, which
 *               looks here before assets-v1 (strategies/cache-first.ts).
 *   Size:       fixed by the build (about 1.5 MB); no cap. Every build renames every file, and old generations stay until exercise 9.
 *   Changes:    only with a new worker install, that is, with a new build.
 */
export const SHELL_CACHE = 'shell-v1'

/**
 * precache-v1                                                                TYPE: precache
 *   Stores:     API answers fetched at install: /api/handbook (the index), the eight /api/handbook/<slug> chapters, and
 *               /api/bench/cache-only/alpha, /beta and /gamma (12 entries). /api/bench/cache-only/delta is missing on purpose.
 *   Filled by:  install, once, all or nothing (caching/precache.ts).
 *   Read by:    cache-only, which answers these URLs from here and never from the network (strategies/cache-only.ts).
 *   Size:       fixed (12 entries); no cap.
 *   Changes:    only with a new worker install. A handbook edition change on the server shows up only after the next install.
 */
export const PRECACHE_CACHE = 'precache-v1'

/**
 * media-v1                                                                   TYPE: runtime
 *   Stores:     images the page loaded: the dispatch plates /media/dispatch/<id>.svg and the station thumbnails /media/station/<code>.svg.
 *   Filled by:  cache-first, the first time each image is asked for (strategies/cache-first.ts). Only a 200 whose type is image/*.
 *   Read by:    cache-first.
 *   Size:       capped at MEDIA_LIMIT entries, oldest stored first.
 */
export const MEDIA_CACHE = 'media-v1'

/**
 * assets-v1                                                                  TYPE: runtime
 *   Stores:     hashed files the page loaded that are not in the shell: the lazy route chunks (/assets/LogPage-<hash>.js and so on), their
 *               stylesheets and any other file under /assets/ (script, style, wasm, font or image types only).
 *   Filled by:  cache-first, the first time each file is asked for (strategies/cache-first.ts).
 *   Read by:    cache-first (after shell-v1).
 *   Size:       no cap. A hashed file only changes with a new build; old generations are removed in exercise 9.
 */
export const ASSETS_CACHE = 'assets-v1'

/**
 * api-v1                                                                     TYPE: runtime
 *   Stores:     three families of API answers, one entry per exact URL (query string included):
 *                 network-first            /api/dispatches (every filter and cursor), /api/dispatches/<id>, /api/inbox/summary, /api/digest
 *                 stale-while-revalidate   /api/stations, /api/stations/<code or id>, /api/bench/stale-while-revalidate/<key>
 *                 cache-first              /api/bench/cache-first/<key>
 *   Filled by:  those three strategies (strategies/network-first.ts, stale-while-revalidate.ts, cache-first.ts).
 *   Read by:    the same three. Network-first reads it only when the network fails or is too slow.
 *   Size:       capped at API_LIMIT entries across all three families, oldest stored first.
 */
export const API_CACHE = 'api-v1'

/**
 * NEVER STORED, in any bucket: /api/signal, /api/session, /api/ping, /api/version, /version.json, /sw.js, everything under /api/push/,
 * /api/_lab/ and /api/bench/network-only/, every request that is not a GET, and the unhashed files /favicon.svg and /icons/*.
 * See NEVER_CACHED below for the part of that list the worker enforces itself.
 */

// ── The files and URLs the precache type stores ────────────────────────────────────────────────────────────────────────────────────────

/** The page is fetched once and stored under all three keys. Every app route returns the same HTML, and Lab -> Caches -> Precheck looks up '/' and '/offline' by these exact URLs. */
export const SHELL_KEYS: readonly string[] = ['/', '/index.html', '/offline']

/** The handbook index. The page and Lab -> Caches look the handbook up by exact name, so it is stored under exactly this URL; chapters are under it. */
export const HANDBOOK_URL = '/api/handbook'

/** The bench's cache-only route. A key is appended: /api/bench/cache-only/alpha. */
export const BENCH_CACHE_ONLY = '/api/bench/cache-only/'

/** delta is missing on purpose. A cache-only route is only safe for what was stored at install; delta exists to show the miss. */
export const BENCH_PRECACHED_KEYS: readonly string[] = ['alpha', 'beta', 'gamma']

/** The bench's cache-first route. A key is appended: /api/bench/cache-first/alpha. */
export const BENCH_CACHE_FIRST = '/api/bench/cache-first/'

// ── Limits and timeouts ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** New dispatches keep arriving, so media cannot grow for ever. 30 is small enough to watch it trim: ten stations plus two more log pages. */
export const MEDIA_LIMIT = 30

/**
 * api-v1 holds one entry per URL: every filter, every "Load more" cursor, every digest `since`, the 11 station URLs and the bench
 * entries. Without a cap it only grows. The cap is oldest first, so a long session of dispatch pages can still push the stations out;
 * that costs one slower visit, never a wrong answer.
 */
export const API_LIMIT = 80

/**
 * How long the network gets before a stored copy is used instead (network first). It has to stay under the page's own request timeout
 * (Lab -> Query -> Settings -> Request timeout, 10 000 ms by default), or the page gives up before the fallback arrives.
 */
export const NETWORK_TIMEOUT_MS = 3000

/** A background revalidation (stale while revalidate) that has not finished by now is abandoned, so it cannot keep the worker alive. */
export const REVALIDATE_TIMEOUT_MS = 10000

// ── What must never be stored ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Live or authenticated data, the worker's own script, the lab instruments, the network-only bench route. Nothing routes these to a
 * strategy that stores, so this list is a second lock, not the first: store() refuses a URL on it whatever rule asked. Each entry is a
 * path and everything under it (on a path-segment boundary: '/api/signal' does not cover '/api/signals').
 */
export const NEVER_CACHED: readonly string[] = [
  '/api/signal',
  '/api/session',
  '/api/ping',
  '/api/version',
  '/version.json',
  '/sw.js',
  '/api/push',
  '/api/_lab',
  '/api/bench/network-only',
]
