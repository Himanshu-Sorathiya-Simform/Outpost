import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { z } from 'zod'
import { errorCenter } from '@/lib/errors/center'
import { toAppError } from '@/lib/errors/normalize'

export type StorageKind = 'local' | 'session'

/** Web Storage that never throws. When the real thing is unavailable or full, values live in memory for this page load. */
export interface SafeStorage {
  readonly kind: StorageKind
  get(key: string): string | null
  /** True when the value reached real storage; false when it only lives in memory. */
  set(key: string, value: string): boolean
  remove(key: string): void
  /** True once any access failed (private mode, storage disabled, quota) and memory is standing in. */
  isDegraded(): boolean
}

function resolveStorage(kind: StorageKind): Storage {
  // Merely reading window.localStorage throws a SecurityError when storage is blocked.
  return kind === 'local' ? window.localStorage : window.sessionStorage
}

export function createSafeStorage(kind: StorageKind, resolve: () => Storage = () => resolveStorage(kind)): SafeStorage {
  /** Only holds keys whose write to real storage failed, so it is always newer than what storage has. */
  const memory = new Map<string, string>()
  let degraded = false
  let quotaReported = false

  const fail = (err: unknown, key: string): void => {
    degraded = true
    const error = toAppError(err, { source: `storage:${kind}`, key })
    // Blocked storage (SecurityError) is an environment fact, not news. A full disk is: say so, once.
    if (error.kind === 'quota' && !quotaReported) {
      quotaReported = true
      errorCenter.report(error, { source: `storage:${kind}` })
    }
  }

  return {
    kind,
    get(key) {
      const held = memory.get(key)
      if (held !== undefined) return held
      try {
        return resolve().getItem(key)
      } catch (err) {
        fail(err, key)
        return null
      }
    },
    set(key, value) {
      try {
        resolve().setItem(key, value)
        memory.delete(key)
        return true
      } catch (err) {
        fail(err, key)
        memory.set(key, value)
        return false
      }
    },
    remove(key) {
      memory.delete(key)
      try {
        resolve().removeItem(key)
      } catch (err) {
        fail(err, key)
      }
    },
    isDegraded: () => degraded,
  }
}

export const safeLocal: SafeStorage = createSafeStorage('local')
export const safeSession: SafeStorage = createSafeStorage('session')

/** Reads and validates a JSON value. Missing, unparsable or invalid data all give `null`. */
export function readJson<T>(storage: SafeStorage, key: string, schema: z.ZodType<T>): T | null {
  const raw = storage.get(key)
  if (raw === null) return null
  try {
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeJson(storage: SafeStorage, key: string, value: unknown): boolean {
  try {
    return storage.set(key, JSON.stringify(value))
  } catch {
    return false
  }
}

export interface PersistedActions<T> {
  /** Merge a patch, re-validate the result (bad values fall back to defaults) and write it through. */
  set(patch: Partial<T>): void
  reset(): void
  /** Re-read storage into the store without writing back. Used when another tab changed the settings. */
  rehydrate(): void
}
export type PersistedStore<T extends object> = UseBoundStore<StoreApi<T & PersistedActions<T>>>

export interface PersistedStoreOptions<T extends object> {
  key: string
  /** Tolerant schema: give every field `.catch(default)` so one bad value never discards the rest. */
  schema: z.ZodType<T>
  defaults: T
  storage?: SafeStorage
}

/** A zustand store of plain settings values, mirrored into safe storage. */
export function createPersistedStore<T extends object>({ key, schema, defaults, storage = safeLocal }: PersistedStoreOptions<T>): PersistedStore<T> {
  const fields = Object.keys(defaults) as Array<keyof T>
  const values = (state: T): T => Object.fromEntries(fields.map((f) => [f, state[f]])) as T
  const load = (): T => readJson(storage, key, schema) ?? defaults

  return create<T & PersistedActions<T>>()((setState, getState) => ({
    ...load(),
    set(patch) {
      const next = schema.parse({ ...values(getState()), ...patch })
      // Write first: subscribers (cross-tab relay) may ask another tab to re-read storage the moment state changes.
      writeJson(storage, key, next)
      setState(next)
    },
    reset() {
      storage.remove(key)
      setState(defaults)
    },
    rehydrate() {
      setState(load())
    },
  }))
}
