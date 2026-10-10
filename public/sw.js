// Outpost service worker.
//
// Exercise 2: install precaches the app shell (the page, its entry script and stylesheets, the fonts), activate takes control of
// open pages at once, and a small fetch handler serves what was precached. The lazy route chunks are NOT precached (exercise 8), so
// offline, an unvisited route still fails to load, on purpose.
// Exercise 3: install also precaches the handbook (the index and every chapter) and the bench keys alpha, beta and gamma, and those
// URLs are answered from that cache and never from the network. A URL that was not stored gets a 504 the page understands.
// Exercise 4: cache first for /media/* (media-v1, capped), for /assets/* (the shell files in shell-v1, everything else the page
// loads in assets-v1) and for /api/bench/cache-first/:key (api-v1). The cache answers when it has the URL; the network is asked only
// on a miss, and the answer is stored only if it is what that URL should be. The unhashed files (/favicon.svg, /icons/*, /version.json)
// are left to the network on purpose: cache first would serve them unchanged forever.
// Exercise 5: network first, with a 3 second timeout, for GET /api/dispatches, /api/dispatches/<id>, /api/inbox/summary and /api/digest.
// A good answer is stored in api-v1 and returned; a failure, a timeout or an unusable answer is replaced by the last stored copy,
// stamped X-SW-Source: fallback. Every other /api request still goes to the network. Later exercises add the strategies for the rest,
// the offline page, versioned cleanup, the update flow, sync and push.
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

const MEDIA_CACHE = 'media-v1' // dispatch plates and station thumbnails, capped at MEDIA_LIMIT entries
const ASSETS_CACHE = 'assets-v1' // hashed files the page loaded after the shell: the lazy route chunks
const API_CACHE = 'api-v1' // API answers stored at runtime (exercise 4: the bench cache-first route)

// New dispatches keep arriving, so media cannot grow for ever. 30 is small enough to watch it trim: ten stations plus two more log pages.
const MEDIA_LIMIT = 30

// How long the network gets before a stored copy is used instead. It has to stay under the page's own request timeout (Lab -> Query ->
// Settings -> Request timeout, 10 000 ms by default), or the page gives up before the fallback arrives.
const NETWORK_TIMEOUT_MS = 3000
// api-v1 holds one entry per URL: every filter, every "Load more" cursor, every digest `since`. Without a cap it only grows. The
// bench cache-first entries live in the same cache and count towards it.
const API_LIMIT = 50

// The cache-only routes. The handbook page and Lab -> Caches look these URLs up by exact name, so they are stored under exactly these.
const HANDBOOK_URL = '/api/handbook'
const BENCH_CACHE_ONLY = '/api/bench/cache-only/'
// delta is missing on purpose. A cache-only route is only safe for what was stored at install; delta exists to show the miss.
const BENCH_PRECACHED_KEYS = ['alpha', 'beta', 'gamma']
const BENCH_CACHE_FIRST = '/api/bench/cache-first/'

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
  return stamped(hit, 'cache', 'cache-only', PRECACHE_CACHE)
}

/**
 * A copy of the response that says where it came from. The page reads these three headers to show "SW cache" or "SW network" on the
 * Bench card and in Lab -> Network. The body is passed on as a stream, not copied.
 */
function stamped(response, source, strategy, cacheName) {
  const headers = new Headers(response.headers)
  headers.set('X-SW-Source', source)
  headers.set('X-SW-Strategy', strategy)
  headers.set('X-SW-Cache', cacheName)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const contentType = (response) => (response.headers.get('content-type') || '').toLowerCase()

// What each cache-first URL has to be before it may be stored. A 404, an error JSON, a captive portal's HTML or a body of zero
// bytes all arrive as a "successful" fetch, and a stored one would be served for as long as the cache lives.
const isImage = async (response) => contentType(response).startsWith('image/')
const ASSET_TYPE = /^(text\/(javascript|css)|application\/(javascript|wasm)|font\/|application\/font-|image\/)/
const isAsset = async (response) => ASSET_TYPE.test(contentType(response))
async function isBenchEntry(response, url) {
  if (!contentType(response).includes('application/json')) return false
  try {
    const body = await readJson(response, url.pathname)
    return body.strategy === 'cache-first' && body.key === url.pathname.slice(BENCH_CACHE_FIRST.length)
  } catch {
    return false
  }
}

/**
 * The cache-first URLs. `readFrom` is searched in order. The assets rule reads shell-v1 first because the shell files were stored there
 * at install; everything else the page loads is stored in assets-v1. `limit` 0 means no cap: hashed files only change with a new build,
 * and exercise 9 deletes old generations.
 */
const CACHE_FIRST = [
  { matches: (path) => path.startsWith('/media/'), readFrom: [MEDIA_CACHE], writeTo: MEDIA_CACHE, limit: MEDIA_LIMIT, accepts: isImage },
  { matches: (path) => path.startsWith('/assets/'), readFrom: [SHELL_CACHE, ASSETS_CACHE], writeTo: ASSETS_CACHE, limit: 0, accepts: isAsset },
  { matches: (path) => /^\/api\/bench\/cache-first\/[^/]+$/.test(path), readFrom: [API_CACHE], writeTo: API_CACHE, limit: 0, accepts: isBenchEntry },
]

// The network-first routes: exactly the dispatch list, one dispatch, the inbox counters and the digest. A path with another segment
// after the id is something else and is not matched.
const NETWORK_FIRST_PATH = /^\/api\/(dispatches(\/[^/]+)?|inbox\/summary|digest)$/
const NETWORK_FIRST = { readFrom: [API_CACHE], writeTo: API_CACHE, limit: API_LIMIT }

/** The first stored copy of the URL, with the name of the cache it was in. A cache that cannot be read counts as one that has nothing. */
async function lookup(rule, href) {
  for (const cacheName of rule.readFrom) {
    try {
      const hit = await caches.match(href, { cacheName })
      if (hit) return { hit, cacheName }
    } catch {
      // keep looking in the next cache, then go to the network
    }
  }
  return undefined
}

/** Keeps the newest `limit` entries. cache.keys() lists them in the order they were stored, so the oldest go first. */
async function trim(cache, limit) {
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key)
}

/**
 * Stores one answer. By now the page already has its response, so a failure here (a full disk, a revoked cache) must not turn into an
 * error for the page: it is logged and the next request tries again.
 */
async function store(rule, url, response) {
  try {
    const cache = await caches.open(rule.writeTo)
    await cache.put(url.href, stampForStorage(response))
    if (rule.limit > 0) await trim(cache, rule.limit)
  } catch (error) {
    console.warn(`Outpost worker: could not store ${url.pathname} in ${rule.writeTo}`, error)
  }
}

/**
 * Cache first: the stored copy if there is one, and the network only when there is not. The exact URL is the key, query string included.
 * A network failure on a miss is not turned into a made-up answer: the page gets the real failure (an image that does not load, a chunk
 * that does not load, an offline error on the Bench card). Only an answer that passes the rule's check is stored, and it is stored from a
 * clone inside event.waitUntil: the page gets the original without waiting for the write, and the worker is not stopped until it is done.
 */
async function cacheFirst(event, request, rule) {
  const url = new URL(request.url)
  const found = await lookup(rule, url.href)
  if (found) return stamped(found.hit, 'cache', 'cache-first', found.cacheName)
  const response = await fetch(request)
  const storable = response.status === 200 && response.headers.get('content-length') !== '0' && (await rule.accepts(response, url))
  if (storable) event.waitUntil(store(rule, url, response.clone()))
  return stamped(response, 'network', 'cache-first', rule.writeTo)
}

/**
 * One try at the network, finished off completely: the answer is read to its last byte (from a clone) before it counts as good, so a
 * feed that is cut off half way or dribbled out slowly is caught here and not by the page. It never rejects. The result says which
 * of four things happened:
 *   { good: true, response }      a 200 with a JSON body that parses
 *   { real: true, response }      an answer that is not a failure of the link and must reach the page as it is: a 401, 403, 404, 304
 *   { reason, response }          a real response that is unusable (5xx, 429, HTML, empty or broken body); the reason names it
 *   { reason: 'network', error }  fetch() itself failed
 */
async function tryNetwork(request, url) {
  let response
  try {
    response = await fetch(request)
  } catch (error) {
    return { reason: 'network', error }
  }
  if (response.status >= 500 || response.status === 429) return { reason: `status-${response.status}`, response }
  if (response.status !== 200) return { real: true, response }
  if (!contentType(response).includes('application/json')) return { reason: 'content-type', response }
  try {
    await readJson(response, url.pathname)
  } catch {
    return { reason: 'body', response }
  }
  return { good: true, response }
}

/** Stores a late answer, one that arrived after the page had already been given the stored copy. */
async function storeLate(attempt, url) {
  const result = await attempt
  if (result.good) await store(NETWORK_FIRST, url, result.response)
}

/**
 * Network first. The network gets NETWORK_TIMEOUT_MS. In time and good: stored from a clone, answered. Otherwise the last stored copy is
 * answered, stamped fallback with the reason. A timed-out request is not abandoned: it keeps running, and if it finishes well the stored
 * copy is refreshed for next time. With nothing stored there is nothing to fall back to, so the real outcome goes through: a slow
 * request is waited for (aborting one that would have worked only makes the page fail), a bad response is handed over as it is, and a
 * failed fetch fails the same way it would without a worker. A 401, 403 or 404 is a real answer and is never replaced by a stored copy.
 */
async function networkFirst(event, request) {
  const url = new URL(request.url)
  const attempt = tryNetwork(request, url)
  let timer
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(resolve, NETWORK_TIMEOUT_MS)
  })
  const early = await Promise.race([attempt, timedOut])
  clearTimeout(timer)

  if (early && early.good) {
    event.waitUntil(store(NETWORK_FIRST, url, early.response.clone()))
    return stamped(early.response, 'network', 'network-first', API_CACHE)
  }
  if (early && early.real) return stamped(early.response, 'network', 'network-first', API_CACHE)

  const reason = early ? early.reason : 'timeout'
  const found = await lookup(NETWORK_FIRST, url.href)
  if (found) {
    if (!early) event.waitUntil(storeLate(attempt, url))
    const answer = stamped(found.hit, 'fallback', 'network-first', found.cacheName)
    answer.headers.set('X-SW-Fallback-Reason', reason)
    return answer
  }

  const outcome = early || (await attempt)
  if (outcome.good) event.waitUntil(store(NETWORK_FIRST, url, outcome.response.clone()))
  if (outcome.response) return stamped(outcome.response, 'network', 'network-first', API_CACHE)
  throw outcome.error
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
  if (isCacheOnly(url.pathname)) {
    event.respondWith(cacheOnly(url))
    return
  }
  if (NETWORK_FIRST_PATH.test(url.pathname)) {
    event.respondWith(networkFirst(event, request))
    return
  }
  // A range request wants part of a file; the stored copy is the whole file, so those go to the network.
  const rule = CACHE_FIRST.find((candidate) => candidate.matches(url.pathname))
  if (rule && !request.headers.has('range')) event.respondWith(cacheFirst(event, request, rule))
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
