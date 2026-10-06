import type { HeaderProfile } from '@shared/contracts'

export interface ProfileInfo {
  value: HeaderProfile
  label: string
  /** What the relay sends. */
  changes: string
  /** The bug or the lesson this profile is there to teach. */
  teaches: string
  /** Something to do, in order. */
  tryThis: string[]
}

/** Cache-Control values the relay sends per resource class under each profile (server/meta.ts is the source). */
export const CACHE_ROWS: Array<{ resource: string; values: Record<HeaderProfile, string> }> = [
  { resource: 'index.html and app routes, sw.js, manifest', values: { realistic: 'no-cache', 'no-store': 'no-store', 'http-cache-trap': 'max-age=31536000' } },
  { resource: '/version.json', values: { realistic: 'no-cache', 'no-store': 'no-store', 'http-cache-trap': 'no-cache' } },
  { resource: '/assets/* (hashed files)', values: { realistic: 'public, max-age=31536000, immutable', 'no-store': 'no-store', 'http-cache-trap': 'public, max-age=31536000, immutable' } },
  { resource: '/media/*', values: { realistic: 'public, max-age=86400', 'no-store': 'no-store', 'http-cache-trap': 'public, max-age=86400' } },
  { resource: 'API (/api/dispatches and the rest)', values: { realistic: 'no-cache, plus an ETag', 'no-store': 'no-store', 'http-cache-trap': 'max-age=60' } },
  { resource: '/api/_lab/*, /api/ping, /api/session, /api/signal', values: { realistic: 'no-store', 'no-store': 'no-store', 'http-cache-trap': 'no-store' } },
]

export const PROFILES: ProfileInfo[] = [
  {
    value: 'realistic',
    label: 'Realistic',
    changes: 'The entry points (index.html, sw.js, the manifest, version.json) are no-cache: the browser may keep a copy but must ask before using it. Hashed files under /assets are cached for a year and marked immutable. API answers are no-cache with an ETag, so a repeat request is a 304 with no body.',
    teaches: 'What a correct deploy looks like. The shell is always checked, the heavy files never are, and a service worker that precaches /assets has nothing to fight with.',
    tryThis: ['Reload twice and open Network: the second index.html is a 304, the chunks come from the disk cache.', 'Change a dispatch, then reload the log: the ETag changes and the body comes back.'],
  },
  {
    value: 'no-store',
    label: 'No store',
    changes: 'Cache-Control: no-store on every response, including hashed assets. The browser keeps nothing; every reload downloads the whole app again.',
    teaches: 'With the HTTP cache removed, the service worker cache is the only cache. Every stale screen you see is one your worker served, not one the browser did. Use it to tell the two apart.',
    tryThis: ['Reload and read the transfer sizes in Network: nothing is ever "disk cache".', 'Register a worker, go offline and reload. Only what the worker stored survives.'],
  },
  {
    value: 'http-cache-trap',
    label: 'HTTP cache trap',
    changes: 'index.html, sw.js and the manifest get max-age=31536000, and the API gets max-age=60. version.json stays no-cache. The same headers a static host sends when someone forgets that entry points must not be cached.',
    teaches: 'The classic "my service worker never updates". A worker registered with updateViaCache "all", or one that imports a script, is checked against the HTTP cache, which says it is fresh for a year. Even with the default, index.html stays stale and keeps pointing at old hashed files, and API reads can be up to a minute old with the worker never asked.',
    tryThis: ['Publish an update in the release simulator, reload, and see that the running build does not change.', 'Edit a dispatch and re-read it within 60 s: the old copy comes back from the disk cache, and Network shows no request.'],
  },
]
