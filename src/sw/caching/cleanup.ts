// What it holds:  the CLEANUP of Cache Storage: which buckets are ours, which of ours are out of date, and the deleting of them. activate()
//                 calls removeOutdated(); the `clear-caches` message calls clearOurs().
// What it means: Cache Storage is shared by everything on the origin and never empties itself, so old buckets stay for ever unless
//                something deletes them. A bucket is named "<family>-v<number>" (config.ts). Two ideas keep the deleting safe:
//                  OURS      a name that is exactly "<one of our families>-v<digits>": 'shell-v1', 'api-v7'. 'api-gateway', 'workbox-precache-v2-...'
//                            and 'shell' are not ours, and are never touched, whatever a message asks for.
//                  CURRENT   the names this worker uses now (CURRENT_CACHES in config.ts, its allow-list). Ours but not current = outdated.
//                A version bump in config.ts is what turns the old bucket into an outdated one.
// Caching type:  none (this file does not fill a bucket; it empties them).
// Caches touched: every bucket of ours, by deleting it whole. It reads caches.keys(); it never opens a bucket or looks inside one.
//
// Who calls it:
//   lifecycle.ts activate()   removeOutdated(): deletes ours-but-not-current, so a bumped version leaves one generation behind
//   lib/messages.ts           clearOurs(prefix?): deletes ours, current or not (Lab -> Worker -> Actions -> Send clear-caches)

import { CACHE_FAMILIES, CURRENT_CACHES } from '../config'

/** True for "<family>-v<digits>" with one of our families. Strict on purpose: another library's 'shell-extension' or 'api-v2-gateway' is not ours. */
export const isOurs = (name: string): boolean => CACHE_FAMILIES.some((family) => new RegExp(`^${family}-v\\d+$`).test(name))

/**
 * Deletes each bucket and says which ones were really deleted. A name that is not there resolves false from caches.delete, which is not
 * an error, so it is left out of the answer. One bucket that cannot be deleted is logged and does not stop the others.
 */
async function deleteAll(names: readonly string[]): Promise<string[]> {
  const results = await Promise.allSettled(names.map((name) => caches.delete(name)))
  const deleted: string[] = []
  results.forEach((result, index) => {
    const name = names[index] ?? ''
    if (result.status === 'fulfilled') {
      if (result.value) deleted.push(name)
    } else {
      console.warn(`Outpost worker: could not delete the cache ${name}`, result.reason)
    }
  })
  return deleted
}

/** Activate: removes every bucket of ours that is not on the allow-list. Says what it removed (an empty list when nothing was outdated). */
export async function removeOutdated(): Promise<string[]> {
  const names = await caches.keys()
  return deleteAll(names.filter((name) => isOurs(name) && !CURRENT_CACHES.includes(name)))
}

/**
 * clear-caches: removes our buckets, the current ones included, so the next offline visit has nothing until a new install precaches again.
 * With a prefix only the ones whose name starts with it ('api-' takes api-v1 and api-v2). Whatever the prefix, a bucket that is not ours
 * is left alone: a prefix that matches only foreign buckets deletes nothing.
 */
export async function clearOurs(prefix?: string): Promise<string[]> {
  const names = await caches.keys()
  return deleteAll(names.filter((name) => isOurs(name) && (prefix === undefined || name.startsWith(prefix))))
}
