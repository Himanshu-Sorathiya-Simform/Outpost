import type { AppErrorKind } from '@/lib'

export interface ErrorLayer {
  id: string
  name: string
  /** Where the code lives. */
  where: string
  /** What it sees, in plain words. */
  catches: string
  /** The kinds that can leave this layer. */
  kinds: AppErrorKind[]
  /** What it does with them: files in the centre or not, shows UI or not, retries or not. */
  then: string
  /** What slips past it. */
  misses: string
}

/** Written from the code, in the order a failure meets them. Change a layer, change its row. */
export const ERROR_LAYERS: readonly ErrorLayer[] = [
  {
    id: 'api',
    name: 'apiFetch classification',
    where: 'src/lib/api/client.ts, src/lib/errors/normalize.ts',
    catches:
      'Every way one request can fail: a rejected fetch, its own timer, the caller\'s abort signal, any non-2xx status, a 2xx body that is empty or not JSON, and JSON that fails the zod contract. It throws nothing but AppError.',
    kinds: ['offline', 'network', 'timeout', 'aborted', 'unauthorized', 'forbidden', 'not-found', 'conflict', 'validation', 'rate-limited', 'unavailable', 'server', 'http', 'parse', 'schema-mismatch', 'cache-miss', 'version-skew'],
    then: 'Writes the request to the client network log, tells the reachability probe about transport failures, and throws. It files nothing: whoever called it decides whether anyone needs telling. 426 maps to version-skew, and 504 with X-SW-Source: cache-miss to cache-miss.',
    misses: 'Failures outside a request: rendering, timers, module loading, browser APIs.',
  },
  {
    id: 'cache',
    name: 'QueryCache and MutationCache onError',
    where: 'src/lib/query/client.ts',
    catches:
      'A query or mutation that has failed for good. Retries come first, and only for retryable kinds (offline, network, timeout, rate-limited, unavailable, server, cache-miss, chunk-load, parse), up to the retries setting. The handler runs once, after the last attempt.',
    kinds: ['offline', 'network', 'timeout', 'unauthorized', 'forbidden', 'not-found', 'conflict', 'validation', 'rate-limited', 'unavailable', 'server', 'http', 'parse', 'schema-mismatch', 'cache-miss', 'version-skew', 'chunk-load', 'unknown'],
    then: 'Files each one silently, with the source query:<hash> or mutation:<key>. Silent because the screen that asked already draws an ErrorState; a toast would say it twice. aborted is skipped, and so is any query with meta.silent.',
    misses: 'Anything not run through the query client: a bare apiFetch in an event handler, and cancellations.',
  },
  {
    id: 'boundary',
    name: 'ErrorBoundary',
    where: 'src/lib/errors/ErrorBoundary.tsx, mounted at the root in src/main.tsx and in the render box above',
    catches: 'An exception thrown while a component renders, in a lifecycle method or in a constructor, anywhere below it. A classified error keeps its kind; every other thrown value becomes render.',
    kinds: ['render', 'chunk-load'],
    then: 'Shows its fallback (the root one offers a reset), files a silent row with the React component stack, and clears itself when a reset key changes.',
    misses: 'Event handlers, timers and promises. React does not route those through a boundary, so they go to the window handlers.',
  },
  {
    id: 'route',
    name: 'Route errorElement',
    where: 'src/shell/RouteError.tsx, set on every route in src/router.tsx',
    catches: 'A route that throws while its lazy module loads or while it renders, plus a 404 response. A rejected lazy import reaches it through a loader that rethrows, because the router would otherwise draw nothing.',
    kinds: ['not-found', 'offline', 'chunk-load', 'render'],
    then: 'A 404 becomes the not-found page and is not filed. Offline shows the offline page, chunk-load shows the stale-screen page and raises the update banner, anything else is an ErrorState. Files each thrown value once, silently, with the source route:<path>.',
    misses: 'Failures inside a screen that has already rendered. A data error is the screen\'s own ErrorState, not the route\'s.',
  },
  {
    id: 'global',
    name: 'Global window handlers',
    where: 'src/lib/errors/global-handlers.ts, installed by startFoundation',
    catches:
      'window error (a throw in an event handler or a timer), unhandledrejection (a promise nobody awaited) and Vite\'s vite:preloadError. An unclassified one becomes unhandled; a classified one keeps its kind.',
    kinds: ['unhandled', 'chunk-load', 'network', 'timeout', 'schema-mismatch', 'unknown'],
    then: 'Files with a toast, the one layer that does: nothing on screen is showing this failure, so it has to interrupt. vite:preloadError also sets the chunkLoadFailed flag the update banner reads, and still lets the import reject.',
    misses: 'Resource loads (images, scripts, stylesheets) fail as plain events that never reach window. The resource log in Lab, Network shows those. ResizeObserver loop notices are ignored on purpose.',
  },
  {
    id: 'seam',
    name: 'callSeam wrapper',
    where: 'src/lib/bridge/seam.ts',
    catches: 'Every call from the website into src/pwa. The thrown value is normalised with apiCall set, so "x is not a function" from a browser API reads as unsupported; DOMExceptions map to permission and quota.',
    kinds: ['not-implemented', 'unsupported', 'permission', 'quota', 'network', 'timeout', 'unknown'],
    then: 'Logs every attempt in the bridge log. A stub (not-implemented) is logged but never filed, and is swallowed when the call is quiet. Anything else is filed (silently when quiet) and rethrown as an AppError so a button can show its exact state.',
    misses: 'A seam called without callSeam. The rule is that none is.',
  },
]
