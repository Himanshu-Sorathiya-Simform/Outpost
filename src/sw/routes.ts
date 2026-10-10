// What it holds:  THE ROUTE TABLE: for every URL the worker takes an interest in, which strategy answers it, and which bucket it uses.
// What it means: this is the one place that answers "what does the worker do with /api/stations?". Each route is a path pattern plus the
//                function that answers it. The first route whose pattern matches wins; a URL that matches none is not touched at all (the
//                browser handles it as if there were no worker). Adding a route means adding one entry here.
// Caching type:  none (each route names the strategy; each strategy names its caching type).
// Caches touched: all of them, by way of the routes.
//
// The routes, in order (strategy / caching type / bucket):
//   /api/handbook, /api/handbook/<slug>, /api/bench/cache-only/<key>   cache-only              precache   precache-v1 (read only)
//   /api/dispatches, /api/dispatches/<id>, /api/inbox/summary, /api/digest
//                                                                      network-first           runtime    api-v1
//   /api/stations, /api/stations/<code>, /api/bench/stale-while-revalidate/<key>
//                                                                      stale-while-revalidate  runtime    api-v1
//   /api/bench/network-only/<key>                                      network-only            none       (no cache)
//   /media/*                                                           cache-first             runtime    media-v1
//   /assets/*                                                          cache-first             runtime    shell-v1 (read) then assets-v1
//   /api/bench/cache-first/<key>                                       cache-first             runtime    api-v1
// Left to the browser on purpose (no route): /api/signal, /api/session, /api/ping, /api/version, /version.json, /api/push/*, /api/_lab/*,
// /favicon.svg, /icons/*, /sw.js, every other /api path, and every request that is not a GET. See NEVER_CACHED in config.ts.

import { API_CACHE, ASSETS_CACHE, MEDIA_CACHE, MEDIA_LIMIT, SHELL_CACHE } from './config'
import { cacheFirst, type CacheFirstRule } from './strategies/cache-first'
import { cacheOnly, isCacheOnly } from './strategies/cache-only'
import { networkFirst } from './strategies/network-first'
import { networkOnly } from './strategies/network-only'
import { staleWhileRevalidate } from './strategies/stale-while-revalidate'
import { isAsset, isBenchEntry, isImage } from './lib/validators'

export interface Route {
  /** What the route is for, in a few words. */
  readonly name: string
  /** True when the route answers this path. */
  readonly matches: (pathname: string) => boolean
  /** True when this particular request is to be left to the browser even though the path matched. */
  readonly declines?: (request: Request) => boolean
  /** Answers the request. */
  readonly handle: (event: FetchEvent, request: Request, url: URL) => Promise<Response>
}

/** A range request wants part of a file; a stored copy is the whole file, so those go to the network. */
const wantsPartOfAFile = (request: Request): boolean => request.headers.has('range')

/** What cache-first stores, and where. `limit` 0 means no cap: hashed files only change with a new build, and exercise 9 deletes old generations. */
const MEDIA_RULE: CacheFirstRule = { readFrom: [MEDIA_CACHE], writeTo: MEDIA_CACHE, limit: MEDIA_LIMIT, accepts: isImage }
const ASSETS_RULE: CacheFirstRule = { readFrom: [SHELL_CACHE, ASSETS_CACHE], writeTo: ASSETS_CACHE, limit: 0, accepts: isAsset }
const BENCH_RULE: CacheFirstRule = { readFrom: [API_CACHE], writeTo: API_CACHE, limit: 0, accepts: isBenchEntry }

export const ROUTES: readonly Route[] = [
  {
    name: 'handbook and bench cache-only: answered from precache-v1, never the network',
    matches: isCacheOnly,
    handle: (_event, _request, url) => cacheOnly(url),
  },
  {
    // Exactly the dispatch list, one dispatch, the inbox counters and the digest. A path with another segment after the id is something else.
    name: 'dispatches, inbox counters, digest: network first with a stored fallback',
    matches: (pathname) => /^\/api\/(dispatches(\/[^/]+)?|inbox\/summary|digest)$/.test(pathname),
    handle: (event, request) => networkFirst(event, request),
  },
  {
    // The station list, one station (a code or an id), and the bench route for any key.
    name: 'stations and the bench route: stale while revalidate',
    matches: (pathname) => /^\/api\/(stations(\/[^/]+)?|bench\/stale-while-revalidate\/[^/]+)$/.test(pathname),
    handle: (event, request) => staleWhileRevalidate(event, request),
  },
  {
    // One key. The only never-cached route that goes through the worker (so the answer can be stamped); the rest are left alone.
    name: 'bench network-only: straight to the server, never stored',
    matches: (pathname) => /^\/api\/bench\/network-only\/[^/]+$/.test(pathname),
    handle: (_event, request) => networkOnly(request),
  },
  {
    name: 'media: cache first into media-v1',
    matches: (pathname) => pathname.startsWith('/media/'),
    declines: wantsPartOfAFile,
    handle: (event, request) => cacheFirst(event, request, MEDIA_RULE),
  },
  {
    name: 'hashed assets: cache first, shell-v1 then assets-v1',
    matches: (pathname) => pathname.startsWith('/assets/'),
    declines: wantsPartOfAFile,
    handle: (event, request) => cacheFirst(event, request, ASSETS_RULE),
  },
  {
    name: 'bench cache-first: cache first into api-v1',
    matches: (pathname) => /^\/api\/bench\/cache-first\/[^/]+$/.test(pathname),
    declines: wantsPartOfAFile,
    handle: (event, request) => cacheFirst(event, request, BENCH_RULE),
  },
]

/** The route that answers this path, or undefined when the worker leaves it alone. */
export const findRoute = (pathname: string): Route | undefined => ROUTES.find((route) => route.matches(pathname))
