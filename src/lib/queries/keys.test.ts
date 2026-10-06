import { describe, expect, it } from 'vitest'
import { normalizeFeedFilters, qk } from './keys'

describe('normalizeFeedFilters', () => {
  it('drops undefined and blank values so "no filter" is one key', () => {
    expect(normalizeFeedFilters({})).toEqual({})
    expect(normalizeFeedFilters({ q: '   ', station: '', severity: undefined, unread: undefined })).toEqual({})
    expect(qk.feed({ q: '' })).toEqual(qk.feed())
  })

  it('trims the search text and keeps false, which is a real filter (only read dispatches)', () => {
    expect(normalizeFeedFilters({ q: '  icing ', unread: false, starred: false, limit: 20 })).toEqual({ q: 'icing', unread: false, starred: false, limit: 20 })
  })
})

describe('qk', () => {
  it('nests keys so one prefix reaches a family', () => {
    const feed = qk.feed({ severity: 'urgent' })
    expect(feed.slice(0, 2)).toEqual([...qk.feeds()])
    expect(feed.slice(0, 1)).toEqual([...qk.dispatches()])
    expect(qk.dispatch('dp-1').slice(0, 2)).toEqual([...qk.details()])
    expect(qk.digest('2026-01-01T00:00:00.000Z').slice(0, 1)).toEqual([...qk.digests()])
  })

  it('keeps the roots the foundation relies on: session, and lab for everything unpersisted', () => {
    expect(qk.session()[0]).toBe('session')
    expect(qk.lab.state()[0]).toBe('lab')
    expect(qk.lab.truth()[0]).toBe('lab')
  })

  it('separates benches by strategy and key, and feeds by filters', () => {
    expect(qk.bench('cache-first', 'alpha')).not.toEqual(qk.bench('cache-only', 'alpha'))
    expect(qk.bench('cache-first', 'alpha')).not.toEqual(qk.bench('cache-first', 'beta'))
    expect(qk.feed({ severity: 'urgent' })).not.toEqual(qk.feed({ severity: 'notice' }))
  })
})
