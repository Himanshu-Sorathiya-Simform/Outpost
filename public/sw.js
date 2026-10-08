// Outpost service worker.
//
// Exercise 1: the worker exists, installs and activates, and does nothing else. There is no fetch handler,
// so every request still goes to the network exactly as it did before a worker was registered.
// Later exercises add precaching, strategies, messages, sync and push here.
//
// Plain script, no build step: this file is copied to dist/sw.js as it is, so it cannot import from src/ or shared/.
// Changing even one byte (this comment counts) is what makes the browser treat it as a new worker version.

self.addEventListener('install', () => {
  // Nothing to precache yet. Without skipWaiting() a second version would wait behind the first (exercise 10).
})

self.addEventListener('activate', () => {
  // Nothing to clean up yet. Without clients.claim() the page that registered this worker stays uncontrolled until it reloads (exercise 2).
})
