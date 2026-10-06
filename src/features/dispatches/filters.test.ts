import { describe, expect, it } from 'vitest'
import { countActiveFilters, isLogLinkState, parseLogFilters, toFeedFilters, writeLogFilters } from './filters'

describe('log filters in the address bar', () => {
  it('reads nothing as "no filter"', () => {
    const values = parseLogFilters(new URLSearchParams(''))
    expect(values).toEqual({ severity: undefined, station: undefined, q: '', unread: false, starred: false })
    expect(countActiveFilters(values)).toBe(0)
  })

  it('round-trips every filter', () => {
    const values = { severity: 'urgent' as const, station: 'KRN-07', q: 'mast icing', unread: true, starred: true }
    const params = writeLogFilters(values)
    expect(params.toString()).toBe('severity=urgent&station=KRN-07&q=mast+icing&unread=1&starred=1')
    expect(parseLogFilters(params)).toEqual(values)
    expect(countActiveFilters(values)).toBe(5)
  })

  it('ignores a severity the contract does not know', () => {
    expect(parseLogFilters(new URLSearchParams('severity=panic')).severity).toBeUndefined()
  })

  it('leaves blank text and false toggles out of the address and the request', () => {
    const values = { severity: undefined, station: undefined, q: '   ', unread: false, starred: false }
    expect(writeLogFilters(values).toString()).toBe('')
    expect(toFeedFilters(values)).toEqual({ severity: undefined, station: undefined, q: undefined, unread: undefined, starred: undefined })
  })

  it('recognises the state the log hands to a dispatch link', () => {
    expect(isLogLinkState({ search: '?q=mast' })).toBe(true)
    expect(isLogLinkState(null)).toBe(false)
    expect(isLogLinkState({ search: 3 })).toBe(false)
  })
})
