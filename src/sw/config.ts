// What it holds:  every name, limit and timeout the worker uses, and above all the CATALOGUE OF CACHES: which bucket stores which files or
//                 API answers, who fills it, who reads it, how big it may grow, and which VERSION of its name is current.
// What it means: Cache Storage is a set of named buckets of URL -> response. Nothing else in the worker may invent a bucket name; each
//                bucket is declared once, here, with what it is for. If you want to know "where does /api/stations end up?", read this file.
//                A bucket's name is "<family>-v<number>" ('shell-v1'). The number is the VERSION: bump it when the old bucket's content must
//                not be read by the new code, and the worker deletes the old generation when it activates (caching/cleanup.ts).
// Caching type:  none (this file only names things; the three types are in caching/).
// Caches touched: all of them, by name.
//
// Two caching TYPES fill the buckets (see caching/):
//   precache  - written once, at install, all or nothing.
//   runtime   - written while the app runs, after a miss or a background refresh.
//   on-demand - written because the page asked. Not used yet (see caching/on-demand.ts).
//
// ── The versions ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The version of each bucket, and the only place a version is written. A number changes by hand, one bucket at a time, when that
 * bucket's stored content has to be thrown away. Typical reasons: a stored JSON shape changed (api, precache), a different set of
 * files must be started from nothing (shell, assets), or stored images are wrong (media).
 *
 * It does NOT change with every build. Every build already gets a new worker, and a number that changed each time would delete the warm
 * media, api and assets buckets on every deploy for no reason. The price: between two bumps a family can hold files of older builds
 * (every build renames every hashed chunk, so `shell` and `assets` collect them) until the next bump or Send clear-caches.
 *
 * Changing one number is a whole release: the new worker installs the new bucket, activates, and deletes the old one. Because of
 * skipWaiting that happens at once, so a tab still running the previous build loses that bucket on its next request (exercise 10 gives
 * that tab a say).
 */
export const CACHE_VERSIONS = {
  shell: 1,
  precache: 1,
  media: 1,
  assets: 1,
  api: 1,
} as const

export type CacheFamily = keyof typeof CACHE_VERSIONS

/** The family names, which are also the prefixes that say "this bucket is ours". */
export const CACHE_FAMILIES = Object.keys(CACHE_VERSIONS) as CacheFamily[]

const nameOf = (family: CacheFamily): string => `${family}-v${CACHE_VERSIONS[family]}`

// ── The catalogue ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * shell-v<N>  (N = CACHE_VERSIONS.shell, 1 today)                            TYPE: precache
 *   Stores:     the page itself, under three keys that hold the same HTML ('/', '/index.html', '/offline'), and the hashed files the app needs
 *               to run offline: the SHELL (entry script, preloaded chunks, stylesheets and font files, 18 files) and every WEBSITE ROUTE chunk
 *               with what it needs (/assets/LogPage-<hash>.js, StationsPage, HandbookPage, ChapterPage, InboxPage, SignalPage, SettingsPage,
 *               ComposePage, DraftsPage and so on, with their stylesheets and shared chunks; about 54 more files). The Lab's page chunks are
 *               NOT here: they are stored at runtime in assets-v<N> when visited. The build lists everything in PRECACHE_URLS.
 *   Filled by:  install, once, all or nothing (caching/precache.ts).
 *   Read by:    navigation (the stored page when the network fails or is too slow, navigation.ts) and the /assets rule of cache-first, which
 *               looks here before assets-v<N> (strategies/cache-first.ts).
 *   Size:       fixed by the build (about 1.5 MB); no cap. Every build renames every file, and an install ADDS the new build's files to the
 *               bucket without removing the previous build's (a tab still running the old build keeps working). They go when the number
 *               is bumped (the old bucket is deleted at activate) or on clear-caches.
 *   Changes:    only with a new worker install, that is, with a new build.
 */
export const SHELL_CACHE = nameOf('shell')

/**
 * precache-v<N>  (CACHE_VERSIONS.precache)                                   TYPE: precache
 *   Stores:     API answers fetched at install: /api/handbook (the index), the eight /api/handbook/<slug> chapters, and
 *               /api/bench/cache-only/alpha, /beta and /gamma (12 entries). /api/bench/cache-only/delta is missing on purpose.
 *   Filled by:  install, once, all or nothing (caching/precache.ts).
 *   Read by:    cache-only, which answers these URLs from here and never from the network (strategies/cache-only.ts).
 *   Size:       fixed (12 entries); no cap.
 *   Changes:    only with a new worker install. A handbook edition change on the server shows up only after the next install. Bump the
 *               number when the shape of these answers changes, so no new code reads an old shape.
 */
export const PRECACHE_CACHE = nameOf('precache')

/**
 * media-v<N>  (CACHE_VERSIONS.media)                                         TYPE: runtime
 *   Stores:     images the page loaded: the dispatch plates /media/dispatch/<id>.svg and the station thumbnails /media/station/<code>.svg.
 *   Filled by:  cache-first, the first time each image is asked for (strategies/cache-first.ts). Only a 200 whose type is image/*.
 *   Read by:    cache-first.
 *   Size:       capped at MEDIA_LIMIT entries, oldest stored first.
 */
export const MEDIA_CACHE = nameOf('media')

/**
 * assets-v<N>  (CACHE_VERSIONS.assets)                                       TYPE: runtime
 *   Stores:     hashed files the page loaded that are not in the shell: the lazy route chunks (/assets/LogPage-<hash>.js and so on), their
 *               stylesheets and any other file under /assets/ (script, style, wasm, font or image types only).
 *   Filled by:  cache-first, the first time each file is asked for (strategies/cache-first.ts).
 *   Read by:    cache-first (after shell-v<N>).
 *   Size:       no cap. A hashed file only changes with a new build; files of older builds go when the number is bumped or on clear-caches.
 */
export const ASSETS_CACHE = nameOf('assets')

/**
 * api-v<N>  (CACHE_VERSIONS.api)                                             TYPE: runtime
 *   Stores:     three families of API answers, one entry per exact URL (query string included):
 *                 network-first            /api/dispatches (every filter and cursor), /api/dispatches/<id>, /api/inbox/summary, /api/digest
 *                 stale-while-revalidate   /api/stations, /api/stations/<code or id>, /api/bench/stale-while-revalidate/<key>
 *                 cache-first              /api/bench/cache-first/<key>
 *   Filled by:  those three strategies (strategies/network-first.ts, stale-while-revalidate.ts, cache-first.ts).
 *   Read by:    the same three. Network-first reads it only when the network fails or is too slow.
 *   Size:       capped at API_LIMIT entries across all three families, oldest stored first.
 *   Changes:    bump the number when a stored shape changes (Lab -> Chaos -> Presets -> Schema drift is the same problem seen live).
 */
export const API_CACHE = nameOf('api')

/** Every bucket name the current worker uses: the allow-list. activate() keeps these and deletes the other buckets of our families. */
export const CURRENT_CACHES: readonly string[] = [SHELL_CACHE, PRECACHE_CACHE, MEDIA_CACHE, ASSETS_CACHE, API_CACHE]

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
 * api-v<N> holds one entry per URL: every filter, every "Load more" cursor, every digest `since`, the 11 station URLs and the bench
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
