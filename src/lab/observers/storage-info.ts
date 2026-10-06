export interface StorageReading {
  supported: boolean
  /** Why it is missing, when it is. */
  reason: string | null
  usage: number | null
  quota: number | null
  persisted: boolean | null
  /** Chromium only: bytes per storage type ('caches', 'indexedDB', 'serviceWorkerRegistrations'). */
  details: Record<string, number> | null
  readAt: number
}

function detailsOf(estimate: StorageEstimate): Record<string, number> | null {
  const raw: unknown = Reflect.get(estimate, 'usageDetails')
  if (typeof raw !== 'object' || raw === null) return null
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw)) if (typeof value === 'number') out[key] = value
  return Object.keys(out).length > 0 ? out : null
}

export async function readStorage(): Promise<StorageReading> {
  const readAt = Date.now()
  if (!('storage' in navigator) || typeof navigator.storage.estimate !== 'function') {
    const insecure = typeof isSecureContext === 'boolean' && !isSecureContext
    return { supported: false, reason: insecure ? `navigator.storage is hidden on insecure origins (${location.origin}).` : 'navigator.storage.estimate is not defined in this browser.', usage: null, quota: null, persisted: null, details: null, readAt }
  }
  const estimate = await navigator.storage.estimate()
  const persisted = typeof navigator.storage.persisted === 'function' ? await navigator.storage.persisted() : null
  return { supported: true, reason: null, usage: estimate.usage ?? null, quota: estimate.quota ?? null, persisted, details: detailsOf(estimate), readAt }
}

/** Asks the browser to exempt this origin from eviction. Returns what it answered, not what was asked. */
export async function requestPersist(): Promise<boolean> {
  if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') throw new TypeError('navigator.storage.persist is not a function')
  return navigator.storage.persist()
}
