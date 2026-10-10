// What it holds:  the declarations of the two constants the build writes into the worker.
// What it means: `__BUILD_ID__` and `__PRECACHE_URLS__` are not variables in the source; the bundler (scripts/sw-build.ts) replaces every
//                use with a literal, so they exist only in the finished dist/sw.js. This file lets TypeScript accept them.
//                They have to end up inside the file: the browser decides "is there a new worker?" by comparing its bytes, so a
//                deploy that changed every hashed file but left these two out would produce identical bytes and nothing would update.
// Caching type:  none.
// Caches touched: none.

/** The id of this build. Every `vite build` gets a new one, so every build is a new worker version. */
declare const __BUILD_ID__: string

/** The app shell files to precache, as URL paths (what index.html points at plus what its stylesheets point at). */
declare const __PRECACHE_URLS__: readonly string[]
