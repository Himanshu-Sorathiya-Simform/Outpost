// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { errorCenter, useErrorCenter } from '@/lib/errors/center'
import { createPersistedStore, createSafeStorage, readJson, writeJson } from './safe'

beforeEach(() => errorCenter.clear())

function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
    ...overrides,
  }
}

describe('createSafeStorage', () => {
  it('reads and writes through to real storage', () => {
    const backing = fakeStorage()
    const s = createSafeStorage('local', () => backing)
    expect(s.set('a', '1')).toBe(true)
    expect(backing.getItem('a')).toBe('1')
    expect(s.get('a')).toBe('1')
    s.remove('a')
    expect(s.get('a')).toBeNull()
    expect(s.isDegraded()).toBe(false)
  })

  it('falls back to memory without throwing or reporting when storage is blocked (private mode)', () => {
    const blocked = (): Storage => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }
    const s = createSafeStorage('local', blocked)
    expect(s.get('x')).toBeNull()
    expect(s.set('x', 'kept')).toBe(false)
    expect(s.get('x')).toBe('kept')
    s.remove('x')
    expect(s.get('x')).toBeNull()
    expect(s.isDegraded()).toBe(true)
    expect(useErrorCenter.getState().records).toHaveLength(0)
  })

  it('keeps the newest value in memory on quota errors and reports quota exactly once', () => {
    const full = fakeStorage({
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError')
      },
    })
    const s = createSafeStorage('local', () => full)
    expect(s.set('a', '1')).toBe(false)
    expect(s.set('a', '2')).toBe(false)
    expect(s.set('b', '3')).toBe(false)
    expect(s.get('a')).toBe('2')
    const { records, counts } = useErrorCenter.getState()
    expect(records).toHaveLength(1)
    expect(records[0]?.error.kind).toBe('quota')
    expect(counts.quota).toBe(1)
  })

  it('prefers a real write once storage works again', () => {
    let failing = true
    const backing = fakeStorage()
    const flaky = fakeStorage({
      getItem: backing.getItem.bind(backing),
      setItem: (k, v) => {
        if (failing) throw new DOMException('full', 'QuotaExceededError')
        backing.setItem(k, v)
      },
    })
    const s = createSafeStorage('local', () => flaky)
    s.set('k', 'memory')
    failing = false
    s.set('k', 'disk')
    expect(s.get('k')).toBe('disk')
  })
})

describe('json helpers', () => {
  const schema = z.object({ n: z.number() })
  it('round-trips valid data and returns null for missing, invalid or unparsable data', () => {
    const backing = fakeStorage()
    const s = createSafeStorage('local', () => backing)
    expect(readJson(s, 'k', schema)).toBeNull()
    expect(writeJson(s, 'k', { n: 4 })).toBe(true)
    expect(readJson(s, 'k', schema)).toEqual({ n: 4 })
    s.set('k', '{"n":"four"}')
    expect(readJson(s, 'k', schema)).toBeNull()
    s.set('k', '{oops')
    expect(readJson(s, 'k', schema)).toBeNull()
  })
})

describe('createPersistedStore', () => {
  const schema = z.object({ size: z.number().int().min(1).max(10).catch(3), label: z.string().catch('none') })
  const defaults = { size: 3, label: 'none' }
  const make = (backing: Storage) => createPersistedStore({ key: 'test.settings', schema, defaults, storage: createSafeStorage('local', () => backing) })

  it('starts from defaults, persists patches and sanitises bad values', () => {
    const backing = fakeStorage()
    const useStore = make(backing)
    expect(useStore.getState()).toMatchObject(defaults)
    useStore.getState().set({ size: 7 })
    expect(JSON.parse(backing.getItem('test.settings') ?? '{}')).toEqual({ size: 7, label: 'none' })
    useStore.getState().set({ size: Number.NaN })
    expect(useStore.getState().size).toBe(3)
    useStore.getState().set({ size: 99 })
    expect(useStore.getState().size).toBe(3)
  })

  it('loads what is stored, field by field, when the store is created', () => {
    const backing = fakeStorage()
    backing.setItem('test.settings', JSON.stringify({ size: 'huge', label: 'kept', extra: true }))
    expect(make(backing).getState()).toMatchObject({ size: 3, label: 'kept' })
    backing.setItem('test.settings', '{broken')
    expect(make(backing).getState()).toMatchObject(defaults)
  })

  it('rehydrate() re-reads storage without writing, reset() restores defaults and clears storage', () => {
    const backing = fakeStorage()
    const useStore = make(backing)
    backing.setItem('test.settings', JSON.stringify({ size: 9, label: 'from another tab' }))
    useStore.getState().rehydrate()
    expect(useStore.getState()).toMatchObject({ size: 9, label: 'from another tab' })
    useStore.getState().reset()
    expect(useStore.getState()).toMatchObject(defaults)
    expect(backing.getItem('test.settings')).toBeNull()
  })

  it('writes to storage before notifying subscribers', () => {
    const backing = fakeStorage()
    const useStore = make(backing)
    let seenInStorage: string | null = null
    useStore.subscribe(() => {
      seenInStorage = backing.getItem('test.settings')
    })
    useStore.getState().set({ label: 'x' })
    expect(seenInStorage).toContain('"label":"x"')
  })
})
