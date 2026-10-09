// Outpost service worker.
//
// Exercise 2: install precaches the app shell (the page, its entry script and stylesheets, the fonts), activate takes control of
// open pages at once, and a small fetch handler serves what was precached. The lazy route chunks are NOT precached (exercise 8), so
// offline, an unvisited route still fails to load, on purpose.
// Exercise 3: install also precaches the handbook (the index and every chapter) and the bench keys alpha, beta and gamma, and those
// URLs are answered from that cache and never from the network. A URL that was not stored gets a 504 the page understands.
// Every other /api request still goes to the network. Later exercises add the strategies for the rest, the offline page, versioned
// cleanup, the update flow, sync and push.
//
// Plain script, no import: this file is copied to dist/sw.js, and vite.config.ts replaces the two tokens below after each build
// (scripts/sw-inject.ts). It has to be that way round: the browser tells a new worker from the old one by comparing bytes of this
// file, so the file list and the build id must be inside it, or a deploy would leave the bytes identical and nothing would update.
// Under `npm run dev` the tokens are not replaced: the list is empty and only the shell and the API data are stored.

const BUILD_ID = '__BUILD_ID__'
const PRECACHE_URLS = /* __PRECACHE_URLS__ */ []

// The version suffixes matter: exercise 9 deletes old generations by them.
const SHELL_CACHE = 'shell-v1' // the app shell and the hashed files it needs
const PRECACHE_CACHE = 'precache-v1' // API data stored at install time and answered cache-only

// The shell: one network fetch of index.html, stored under three keys. Every app route returns the same HTML, and Lab -> Caches -> Precheck
// looks up '/' and '/offline' by those exact URLs.
const SHELL_KEYS = ['/', '/index.html', '/offline']

const PRECACHED = new Set(PRECACHE_URLS)

// The cache-only routes. The handbook page and Lab -> Caches look these URLs up by exact name, so they are stored under exactly these.
const HANDBOOK_URL = '/api/handbook'
const BENCH_CACHE_ONLY = '/api/bench/cache-only/'
// delta is missing on purpose. A cache-only route is only safe for what was stored at install; delta exists to show the miss.
const BENCH_PRECACHED_KEYS = ['alpha', 'beta', 'gamma']

/**
 * Fetches one URL for the precache and refuses anything that is not what it should be.
 * `cache: 'reload'` skips the HTTP cache: under the "HTTP cache trap" profile '/' is allowed to be a year old, and a precache
 * must hold what the server has now. `kind` says what the body must be ('html', 'json', or 'asset' for anything that is not HTML),
 * so a captive portal's sign-in page cannot be stored as a script or as the handbook.
 */
async function fetchForPrecache(url, kind) {
  const accept = kind === 'html' ? 'text/html' : kind === 'json' ? 'application/json' : undefined
  const response = await fetch(new Request(url, { cache: 'reload', headers: accept ? { Accept: accept } : undefined }))
  if (response.status !== 200) throw new Error(`Precache: ${url} answered ${response.status}`)
  const type = response.headers.get('content-type') || ''
  const expected = kind === 'html' ? type.includes('text/html') : kind === 'json' ? type.includes('application/json') : !type.includes('text/html')
  if (!expected) throw new Error(`Precache: ${url} answered with content type "${type}"`)
  return response
}

/** Parses a body without consuming it (it works on a clone), and refuses empty, garbled or non-object JSON. */
async function readJson(response, url) {
  let body
  try {
    body = await response.clone().json()
  } catch {
    throw new Error(`Precache: ${url} is not valid JSON`)
  }
  if (typeof body !== 'object' || body === null) throw new Error(`Precache: ${url} is not a JSON object`)
  return body
}

/**
 * The handbook index, every chapter it lists, and the bench keys, each checked for what it claims to be. Every chapter must belong
 * to the same edition as the index: the server can change edition between two requests, and a mixed set would be a handbook that
 * contradicts itself. Returns [url, response] pairs; nothing is written here.
 */
async function downloadApiData() {
  const indexResponse = await fetchForPrecache(HANDBOOK_URL, 'json')
  const index = await readJson(indexResponse, HANDBOOK_URL)
  if (typeof index.edition !== 'string' || !Array.isArray(index.chapters) || index.chapters.length === 0) {
    throw new Error(`Precache: ${HANDBOOK_URL} lists no chapters`)
  }
  const chapters = await Promise.all(
    index.chapters.map(async (meta) => {
      const slug = meta && meta.slug
      if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) throw new Error(`Precache: ${HANDBOOK_URL} lists a chapter with an unusable slug`)
      const url = `${HANDBOOK_URL}/${slug}`
      const response = await fetchForPrecache(url, 'json')
      const chapter = await readJson(response, url)
      if (chapter.slug !== slug) throw new Error(`Precache: ${url} is the chapter "${chapter.slug}"`)
      if (chapter.edition !== index.edition) throw new Error(`Precache: ${url} is edition ${chapter.edition} but the index is edition ${index.edition}`)
      return [url, response]
    }),
  )
  const bench = await Promise.all(
    BENCH_PRECACHED_KEYS.map(async (key) => {
      const url = `${BENCH_CACHE_ONLY}${key}`
      const response = await fetchForPrecache(url, 'json')
      const body = await readJson(response, url)
      if (body.strategy !== 'cache-only' || body.key !== key) throw new Error(`Precache: ${url} is not the cache-only entry for ${key}`)
      return [url, response]
    }),
  )
  return [[HANDBOOK_URL, indexResponse], ...chapters, ...bench]
}

/**
 * A copy of the response with the time it was stored added. Everything else is kept as it was, X-Served-At included: that header
 * is the data's true age, and a stored copy that looked freshly served would hide how old it is.
 */
function stampForStorage(response) {
  const headers = new Headers(response.headers)
  headers.set('X-SW-Cached-At', new Date().toISOString())
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

/**
 * The shell, its files and the API data are all downloaded and checked before the first write, so one bad file fails the whole install
 * (the old worker, if any, keeps running). The buckets are only opened after that, so a failed install leaves nothing behind, not even an
 * empty bucket. cache.addAll() would also reject on a bad status, but it stores any body and cannot say which file was the problem.
 */
async function precache() {
  const shell = await fetchForPrecache('/index.html', 'html')
  const [files, api] = await Promise.all([Promise.all(PRECACHE_URLS.map(async (url) => [url, await fetchForPrecache(url, 'asset')])), downloadApiData()])
  const [shellCache, apiCache] = await Promise.all([caches.open(SHELL_CACHE), caches.open(PRECACHE_CACHE)])
  await Promise.all([
    ...SHELL_KEYS.map((key) => shellCache.put(new Request(key), shell.clone())),
    ...files.map(([url, response]) => shellCache.put(url, response)),
    ...api.map(([url, response]) => apiCache.put(url, stampForStorage(response))),
  ])
}

/** Precache, and only when that worked, skip the waiting state. A rejection here is what makes the browser discard this worker. */
async function install() {
  await precache()
  // skipWaiting() lets this worker replace an older one at once. Fine for now; exercise 10 takes it out and makes it a choice.
  await self.skipWaiting()
}

self.addEventListener('install', (event) => {
  event.waitUntil(install())
})

self.addEventListener('activate', (event) => {
  // Without claim() the page that registered this worker stays uncontrolled until it reloads.
  event.waitUntil(self.clients.claim())
})

/** A path the server would answer with the app shell: no file extension, and not an API or media URL. */
function isAppRoute(pathname) {
  return !/\.[a-z0-9]+$/i.test(pathname) && !pathname.startsWith('/api/') && !pathname.startsWith('/media/')
}

/** Network first, so a deploy is seen at once. Only when the network fails does the page get the stored shell. */
async function navigate(request) {
  try {
    return await fetch(request)
  } catch (error) {
    const shell = await caches.match('/index.html', { cacheName: SHELL_CACHE })
    if (shell) return shell
    throw error
  }
}

/** A precached file has a hash in its name, so it never changes under that name: the stored copy is always right. */
async function fromPrecache(request) {
  const hit = await caches.match(request, { cacheName: SHELL_CACHE })
  return hit || fetch(request)
}

/**
 * Exactly the handbook index, its chapters, and the bench's cache-only routes. The match is on the path with a boundary: '/api/handbook'
 * itself or something under '/api/handbook/', never a name that merely starts with those letters.
 */
function isCacheOnly(pathname) {
  return pathname === HANDBOOK_URL || pathname.startsWith(`${HANDBOOK_URL}/`) || pathname.startsWith(BENCH_CACHE_ONLY)
}

/**
 * The answer for a cache-only URL that was not stored: 504 with X-SW-Source: cache-miss, and a body in the server's own error shape.
 * That exact pair is what the page turns into its "Not stored for offline use" screen. Deliberately not a network error (the page
 * would read it as "offline") and not an answer from the network (this route must never go there). No X-Served-By: that header
 * means "the server answered", and the server did not.
 */
function cacheMiss(url) {
  const body = {
    error: {
      code: 'unavailable',
      message: `Not stored for offline use: ${url.pathname}. This route is answered from the install-time cache and never from the network.`,
      requestId: `sw-${Date.now().toString(36)}`,
    },
  }
  return new Response(JSON.stringify(body), {
    status: 504,
    statusText: 'Not stored for offline use',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-SW-Source': 'cache-miss', 'X-SW-Strategy': 'cache-only', 'X-SW-Cache': PRECACHE_CACHE },
  })
}

/**
 * Cache only: the stored copy or the miss, never the network. The lookup is the exact URL, query string included, so '/api/handbook?x=1'
 * is a miss rather than quietly returning the unfiltered copy. A cache that cannot be read is treated as a miss too: the page then shows
 * the same screen instead of a generic network failure.
 */
async function cacheOnly(url) {
  let hit
  try {
    hit = await caches.match(url.href, { cacheName: PRECACHE_CACHE })
  } catch {
    hit = undefined
  }
  if (!hit) return cacheMiss(url)
  const headers = new Headers(hit.headers)
  headers.set('X-SW-Source', 'cache')
  headers.set('X-SW-Strategy', 'cache-only')
  headers.set('X-SW-Cache', PRECACHE_CACHE)
  return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers })
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Not calling respondWith() leaves the request to the browser, exactly as if there were no worker.
  if (request.mode === 'navigate') {
    if (isAppRoute(url.pathname)) event.respondWith(navigate(request))
    return
  }
  if (isCacheOnly(url.pathname)) event.respondWith(cacheOnly(url))
  else if (PRECACHED.has(url.pathname)) event.respondWith(fromPrecache(request))
})

/** Tells whoever asked which build this worker is and which caches it holds. */
async function replyWithVersion(source) {
  const names = await caches.keys()
  if (source) source.postMessage({ type: 'sw-version', version: BUILD_ID, caches: names })
}

// Lab -> Worker -> Actions -> "Send get-version": tells two worker versions apart, which a script URL cannot.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'get-version') return
  event.waitUntil(replyWithVersion(event.source))
})
