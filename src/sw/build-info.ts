// What it holds:  the build id and the list of shell files, as values the rest of the worker can import.
// What it means: both are decided at build time (scripts/sw-build.ts replaces the two placeholders with literals), so they are fixed
//                for the life of this worker file. A new build writes new values, the bytes change, and the browser installs a new worker.
// Caching type:  none (it only feeds the precache type and the version reply).
// Caches touched: none.
//
// Kept apart from config.ts on purpose: config.ts has no placeholders in it, so it can be loaded on its own, in a test for instance.

/** Identifies this build of the worker. Sent back to the page for the message "get-version", so two worker versions can be told apart. */
export const BUILD_ID: string = __BUILD_ID__

/**
 * The files `shell-v1` receives at install besides the page itself: the shell (entry script, preloaded chunks, stylesheets, fonts) and then the
 * website's route chunks with what they need. Every build renames all of them. Empty under `npm run dev`.
 */
export const PRECACHE_URLS: readonly string[] = __PRECACHE_URLS__
