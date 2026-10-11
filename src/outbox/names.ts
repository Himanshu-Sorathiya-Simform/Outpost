// What it holds:  the four names the outbox is known by: the database, the object store, the sync tag and the broadcast channel.
// What it means: these strings are fixed by the contract in shared/sw-protocol.ts (OUTBOX_DB, OUTBOX_STORE, SYNC_TAG_OUTBOX,
//                SW_BROADCAST_CHANNEL). They are written out again here, and not imported, because that file also builds zod schemas, and the
//                service worker bundle must not carry zod. src/outbox/names.test.ts checks that the copies still equal the contract.
// Used by:       the page (src/pwa/sync.ts) and the worker (src/sw/sync.ts), through the other files in this folder.

export const OUTBOX_DB = 'outpost-outbox'
export const OUTBOX_STORE = 'outbox'
export const SYNC_TAG_OUTBOX = 'outbox-flush'
export const SW_BROADCAST_CHANNEL = 'outpost-sw'

/** The lock that lets one replay at a time run (replay.ts). */
export const OUTBOX_LOCK = 'outpost-outbox-flush'
