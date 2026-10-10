/**
 * Build-time half of the service worker. The worker is written as TypeScript modules under src/sw/ and bundled here into ONE classic
 * script, dist/sw.js. Two values are written into that script while it is bundled: the build id and the list of shell files.
 *
 * The reason they have to be inside the file is not convenience. A browser decides "is there a new worker?" by comparing the bytes of
 * sw.js. If the precache list and the build id lived anywhere else, a deploy would change every hashed file and leave sw.js byte for
 * byte the same, so no worker would ever re-install and the precache would be stale for good. They are passed as `define` constants:
 * every `__BUILD_ID__` and `__PRECACHE_URLS__` in the source is replaced by a JSON literal (so an odd value cannot break out of its string).
 *
 * One script and not several files: a file pulled in with importScripts() follows the HTTP cache rules, which under the "HTTP cache trap"
 * profile would let a stale part hide a deploy. The browser fetches sw.js itself, bypassing that cache, and gets everything at once.
 */
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

/** The repository root: where src/ and shared/ live, and what the paths in the bundle's region comments are relative to. */
const ROOT = fileURLToPath(new URL('..', import.meta.url))

export const WORKER_ENTRY = fileURLToPath(new URL('../src/sw/index.ts', import.meta.url))

export interface WorkerBuild {
  /** Identifies this build. Every `vite build` gets a new one. */
  buildId: string
  /** The shell files to precache, as URL paths. */
  urls: readonly string[]
  /** What to bundle. Defaults to the worker; tests bundle a small entry that also exposes internals. */
  entry?: string
}

/** Bundles the worker into one classic script and returns its source. Nothing is written to disk. */
export async function bundleWorker({ buildId, urls, entry = WORKER_ENTRY }: WorkerBuild): Promise<string> {
  const result = await build({
    root: ROOT,
    configFile: false,
    logLevel: 'silent',
    publicDir: false,
    resolve: { alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) } },
    define: { __BUILD_ID__: JSON.stringify(buildId), __PRECACHE_URLS__: JSON.stringify(urls) },
    build: {
      write: false,
      minify: false,
      sourcemap: false,
      target: 'es2022',
      emptyOutDir: false,
      lib: { entry, formats: ['iife'], name: 'OutpostWorker', fileName: () => 'sw.js' },
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((one) => ('output' in one ? one.output : []))
  const chunk = outputs.find((item) => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('The service worker bundle produced no script. Is src/sw/index.ts still the entry?')
  return chunk.code
}
