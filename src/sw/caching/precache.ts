// What it holds:  the PRECACHE caching type: the install-time download, check and write of the app shell and the handbook data.
// What it means: "precache" means the buckets are filled once, at install, BEFORE anyone asks, so the app can start with no network. It
//                is all or nothing: every file is downloaded and checked first and the buckets are opened only after that, so one bad
//                file fails the whole install (the browser keeps the old worker) and a failed install leaves no bucket behind, not even
//                an empty one. Contrast with runtime (filled after a miss) and on-demand (filled because the page asked).
// Caching type:  precache.
// Caches touched: shell-v1 (written: the page under '/', '/index.html' and '/offline', the ~18 hashed shell files and the ~54 website route
//                 chunk files) and precache-v1 (written: /api/handbook, its 8 chapters, /api/bench/cache-only/{alpha,beta,gamma}).
//
// Who reads what this type stores:
//   navigation (navigation.ts)        shell-v1, when the network fails
//   cache-only (strategies/)          precache-v1, always, never the network
//   cache-first /assets rule          shell-v1, before assets-v1

import {
  BENCH_CACHE_ONLY,
  BENCH_PRECACHED_KEYS,
  HANDBOOK_URL,
  PRECACHE_CACHE,
  SHELL_CACHE,
  SHELL_KEYS,
} from '../config'
import { PRECACHE_URLS } from '../build-info'
import { stampForStorage } from '../lib/headers'
import { readJson } from '../lib/network'

type Kind = 'html' | 'json' | 'asset'

/**
 * Fetches one URL for the precache and refuses anything that is not what it should be.
 * `cache: 'reload'` skips the HTTP cache: under the "HTTP cache trap" profile '/' is allowed to be a year old, and a precache
 * must hold what the server has now. `kind` says what the body must be ('html', 'json', or 'asset' for anything that is not HTML),
 * so a captive portal's sign-in page cannot be stored as a script or as the handbook.
 */
async function fetchForPrecache(url: string, kind: Kind): Promise<Response> {
  const accept = kind === 'html' ? 'text/html' : kind === 'json' ? 'application/json' : undefined
  const response = await fetch(new Request(url, { cache: 'reload', headers: accept ? { Accept: accept } : undefined }))
  if (response.status !== 200) throw new Error(`Precache: ${url} answered ${response.status}`)
  const type = response.headers.get('content-type') || ''
  const expected = kind === 'html' ? type.includes('text/html') : kind === 'json' ? type.includes('application/json') : !type.includes('text/html')
  if (!expected) throw new Error(`Precache: ${url} answered with content type "${type}"`)
  // Read the body now, before the next download, and hand back a copy that holds it in memory. A response whose body nobody has read keeps
  // its connection busy, and under the "No store" profile nothing else reads it (the browser's HTTP cache normally drains it). The install
  // starts about 30 downloads at once and the browser allows 6 connections per host, so six half-read bodies and the rest of the downloads
  // wait for ever: the install never finishes and the stored shell stays the one from the previous build. About 1.3 MB in all.
  const body = await response.arrayBuffer()
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}

/** Reads a precached JSON answer; a failure names the URL and starts with "Precache:". */
const readPrecacheJson = (response: Response, url: string): Promise<Record<string, unknown>> => readJson(response, `Precache: ${url}`)

/**
 * The handbook index, every chapter it lists, and the bench keys, each checked for what it claims to be. Every chapter must belong
 * to the same edition as the index: the server can change edition between two requests, and a mixed set would be a handbook that
 * contradicts itself. Returns [url, response] pairs; nothing is written here.
 */
async function downloadApiData(): Promise<Array<[string, Response]>> {
  const indexResponse = await fetchForPrecache(HANDBOOK_URL, 'json')
  const index = await readPrecacheJson(indexResponse, HANDBOOK_URL)
  if (typeof index.edition !== 'string' || !Array.isArray(index.chapters) || index.chapters.length === 0) {
    throw new Error(`Precache: ${HANDBOOK_URL} lists no chapters`)
  }
  const chapters = await Promise.all(
    (index.chapters as unknown[]).map(async (meta): Promise<[string, Response]> => {
      const slug = (meta as { slug?: unknown } | null)?.slug
      if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) throw new Error(`Precache: ${HANDBOOK_URL} lists a chapter with an unusable slug`)
      const url = `${HANDBOOK_URL}/${slug}`
      const response = await fetchForPrecache(url, 'json')
      const chapter = await readPrecacheJson(response, url)
      if (chapter.slug !== slug) throw new Error(`Precache: ${url} is the chapter "${String(chapter.slug)}"`)
      if (chapter.edition !== index.edition) throw new Error(`Precache: ${url} is edition ${String(chapter.edition)} but the index is edition ${index.edition}`)
      return [url, response]
    }),
  )
  const bench = await Promise.all(
    BENCH_PRECACHED_KEYS.map(async (key): Promise<[string, Response]> => {
      const url = `${BENCH_CACHE_ONLY}${key}`
      const response = await fetchForPrecache(url, 'json')
      const body = await readPrecacheJson(response, url)
      if (body.strategy !== 'cache-only' || body.key !== key) throw new Error(`Precache: ${url} is not the cache-only entry for ${key}`)
      return [url, response]
    }),
  )
  return [[HANDBOOK_URL, indexResponse], ...chapters, ...bench]
}

/**
 * The shell, its files and the API data are all downloaded and checked before the first write, so one bad file fails the whole install
 * (the old worker, if any, keeps running). The buckets are only opened after that, so a failed install leaves nothing behind, not even an
 * empty bucket. cache.addAll() would also reject on a bad status, but it stores any body and cannot say which file was the problem.
 */
export async function precache(): Promise<void> {
  const shell = await fetchForPrecache('/index.html', 'html')
  const [files, api] = await Promise.all([
    Promise.all(PRECACHE_URLS.map(async (url): Promise<[string, Response]> => [url, await fetchForPrecache(url, 'asset')])),
    downloadApiData(),
  ])
  const [shellCache, apiCache] = await Promise.all([caches.open(SHELL_CACHE), caches.open(PRECACHE_CACHE)])
  await Promise.all([
    ...SHELL_KEYS.map((key) => shellCache.put(new Request(key), shell.clone())),
    ...files.map(([url, response]) => shellCache.put(url, response)),
    ...api.map(([url, response]) => apiCache.put(url, stampForStorage(response))),
  ])
}
