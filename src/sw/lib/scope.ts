// What it holds:  the worker's own global object, typed as a service worker.
// What it means: inside a worker, `self` is the global scope. TypeScript knows it only as a generic worker scope, so this one cast says
//                "it is a service worker" once, and every other file imports `scope` instead of casting for itself.
// Caching type:  none.
// Caches touched: none.

export const scope = self as unknown as ServiceWorkerGlobalScope
