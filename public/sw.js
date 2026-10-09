// Outpost service worker.
//
// Exercise 2: install precaches the app shell (the page, its entry script and stylesheets, the fonts), activate takes control of
// open pages at once, and a small fetch handler serves what was precached. The lazy route chunks are NOT precached (exercise 8), and
// API data is untouched: every /api request still goes to the network. So offline, an unvisited route still fails to load, on purpose.
// Later exercises add the strategies for data, the offline page, versioned cleanup, the update flow, sync and push.
//
// Plain script, no import: this file is copied to dist/sw.js, and vite.config.ts replaces the two tokens below after each build
// (scripts/sw-inject.ts). It has to be that way round: the browser tells a new worker from the old one by comparing bytes of this
// file, so the file list and the build id must be inside it, or a deploy would leave the bytes identical and nothing would update.
// Under `npm run dev` the tokens are not replaced: the list is empty and only the shell is stored.

const BUILD_ID = '__BUILD_ID__'
const PRECACHE_URLS = /* __PRECACHE_URLS__ */ []

// The version suffix matters: exercise 9 deletes old generations by it.
const SHELL_CACHE = 'shell-v1'

// The shell: one network fetch of index.html, stored under three keys. Every app route returns the same HTML, and Lab -> Caches -> Precheck
// looks up '/' and '/offline' by those exact URLs.
const SHELL_KEYS = ['/', '/index.html', '/offline']

const PRECACHED = new Set(PRECACHE_URLS)

/**
 * Fetches one URL for the precache and refuses anything that is not what it should be.
 * `cache: 'reload'` skips the HTTP cache: under the "HTTP cache trap" profile '/' is allowed to be a year old, and a precache
 * must hold what the server has now. `html` says which kind of body is expected, so a captive portal's sign-in page cannot be
 * stored as a script.
 */
async function fetchForPrecache(url, html) {
  const request = new Request(url, { cache: 'reload', headers: html ? { Accept: 'text/html' } : undefined })
  const response = await fetch(request)
  if (response.status !== 200) throw new Error(`Precache: ${url} answered ${response.status}`)
  const type = response.headers.get('content-type') || ''
  if (html !== type.includes('text/html')) throw new Error(`Precache: ${url} answered with content type "${type}"`)
  return response
}

/**
 * The shell and the files it needs are downloaded and checked before the first write, so one bad file fails the whole install (the old worker, if
 * any, keeps running). cache.addAll() would do the same, but it also stores any status and any body.
 */
async function precache() {
  const cache = await caches.open(SHELL_CACHE)
  const shell = await fetchForPrecache('/index.html', true)
  const files = await Promise.all(PRECACHE_URLS.map(async (url) => [url, await fetchForPrecache(url, false)]))
  await Promise.all([...SHELL_KEYS.map((key) => cache.put(new Request(key), shell.clone())), ...files.map(([url, response]) => cache.put(url, response))])
}

self.addEventListener('install', (event) => {
  // skipWaiting() lets this worker replace an older one at once. Fine for now; exercise 10 takes it out and makes it a choice.
  event.waitUntil(precache().then(() => self.skipWaiting()))
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
  if (PRECACHED.has(url.pathname)) event.respondWith(fromPrecache(request))
})

// Lab -> Worker -> Actions -> "Send get-version": tells two worker versions apart, which a script URL cannot.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'get-version') return
  event.waitUntil(
    caches.keys().then((names) => {
      if (event.source) event.source.postMessage({ type: 'sw-version', version: BUILD_ID, caches: names })
    }),
  )
})
