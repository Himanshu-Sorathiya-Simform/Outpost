// What it holds:  nothing yet. This file is a documented PLACEHOLDER for the on-demand caching type.
// What it means: "on-demand" caching fills a bucket because the PAGE ASKED, not because of an install or a request. The page posts the
//                worker a list of URLs ({ type: 'prefetch', urls: [...] } in shared/sw-protocol.ts) and the worker fetches and stores
//                each one. Typical uses: "save this chapter for the trip", "warm these routes before the link drops". Contrast with
//                precache (the worker decides, at install) and runtime (a request decides, after a miss).
// Caching type:  on-demand.
// Caches touched: none today. When it exists it would write to one of the runtime buckets (most likely api-v1) with the same validation
//                 and caps as the runtime type, and the page would be told with a message when the pages are stored.
//
// Why it is empty: no exercise in docs/LEARNING.md needs it, and the contract says "no button sends it". The message already exists in
// the contract, so adding it later means one handler in lib/messages.ts that calls into this file. Nothing in the worker imports it.

export {}
