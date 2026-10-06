import { describe, expect, it } from 'vitest'
import type { Station } from '@shared/contracts'
import { draftInputFromValues, isBlankEntry, readCoords, valuesFromDraft, BLANK_VALUES } from './form-values'
import { readPrefill } from './prefill'
import { cleanBlock, cleanLine, firstUrlIn, webUrl } from './sanitize'
import { buildDispatch, firstErrorField, issuesFromDetails, issuesToErrors } from './validate'

const station = { id: 'st-krn07', code: 'KRN-07' } as Station
const ctx = { clientId: 'client-123456', filedAtClient: '2026-09-30T08:00:00.000Z', stations: [station] }
const good = { ...BLANK_VALUES, stationId: 'krn-07', title: 'Mast icing', body: 'Ice on the relay mast.' }

describe('readCoords', () => {
  it('accepts a pair, commas and blanks', () => {
    expect(readCoords('', ' ')).toEqual({ kind: 'none' })
    expect(readCoords('61,2181', '-149.9')).toEqual({ kind: 'ok', coords: { lat: 61.2181, lng: -149.9 } })
  })
  it('rejects halves, garbage and out-of-range angles', () => {
    expect(readCoords('61', '').kind).toBe('invalid')
    expect(readCoords('north', '3').kind).toBe('invalid')
    expect(readCoords('91', '3').kind).toBe('invalid')
    expect(readCoords('3', '181').kind).toBe('invalid')
  })
})

describe('draft <-> form', () => {
  it('keeps unusable coordinates as text so they survive a reload', () => {
    const input = draftInputFromValues({ ...good, lat: '61', lng: '' })
    expect(input.coords).toBeUndefined()
    expect(valuesFromDraft(input)).toMatchObject({ lat: '61', lng: '' })
  })
  it('does not count a station alone as an entry', () => {
    expect(isBlankEntry({ ...BLANK_VALUES, stationId: 'st-krn07' })).toBe(true)
    expect(isBlankEntry({ ...BLANK_VALUES, tags: ['ice'] })).toBe(false)
  })
})

describe('buildDispatch', () => {
  it('resolves a station code to its id and trims', () => {
    const built = buildDispatch({ ...good, title: '  Mast icing  ' }, ctx)
    expect(built.ok && built.input).toMatchObject({ stationId: 'st-krn07', title: 'Mast icing', coords: null, tags: [] })
  })
  it('reports friendly messages per field', () => {
    const built = buildDispatch({ ...good, stationId: 'nope-1', title: 'ab', body: '   ', tags: ['x'.repeat(25)] }, ctx)
    expect(built.ok).toBe(false)
    if (!built.ok) {
      expect(built.errors.stationId).toMatch(/No station/)
      expect(built.errors.title).toBe('Title needs at least 3 characters.')
      expect(built.errors.body).toBe('Write something in the body.')
      expect(built.errors.tags).toBe('Tag 1 is over 24 characters.')
      expect(firstErrorField(built.errors)).toBe('stationId')
    }
  })
  it('checks only the shape of a typed station when the list is missing', () => {
    expect(buildDispatch({ ...good, stationId: 'krn-07' }, { ...ctx, stations: undefined }).ok).toBe(true)
    const bad = buildDispatch({ ...good, stationId: 'banana' }, { ...ctx, stations: undefined })
    expect(!bad.ok && bad.errors.stationId).toMatch(/station code/)
  })
  it('flags overlong bodies and too many tags', () => {
    const built = buildDispatch({ ...good, body: 'x'.repeat(4001), tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }, ctx)
    expect(!built.ok && built.errors.body).toBe('Body is over 4000 characters.')
    expect(!built.ok && built.errors.tags).toBe('At most 8 tags.')
  })
})

describe('relay validation details', () => {
  it('maps zod issue paths onto fields', () => {
    const issues = issuesFromDetails([
      { code: 'too_small', path: ['title'], minimum: 3, origin: 'string', message: 'Too small' },
      { code: 'custom', path: ['stationId'], message: 'Unknown station' },
      { code: 'custom', path: ['clientId'], message: 'Bad key' },
    ])
    expect(issuesToErrors(issues)).toEqual({ title: 'Title needs at least 3 characters.', stationId: 'Unknown station', form: 'Bad key' })
  })
  it('ignores details of the wrong shape', () => {
    expect(issuesFromDetails('nope')).toEqual([])
    expect(issuesFromDetails(undefined)).toEqual([])
  })
})

describe('sanitizing', () => {
  it('strips control and bidi characters and clips', () => {
    expect(cleanLine('a\u0000b‮c\n  d', 10)).toBe('abc d')
    expect(cleanBlock('one\r\n\r\n\r\n\r\ntwo\u0007', 100)).toBe('one\n\ntwo')
    expect(cleanLine('x'.repeat(50), 5)).toBe('xxxxx')
  })
  it('only carries http(s) links', () => {
    expect(webUrl('https://example.org/a?b=1')).toBe('https://example.org/a?b=1')
    expect(webUrl('javascript:alert(1)')).toBeNull()
    expect(webUrl('/relative')).toBeNull()
    expect(firstUrlIn('See (https://example.org/x), thanks')).toBe('https://example.org/x')
    expect(firstUrlIn('no link here')).toBeNull()
  })
})

describe('readPrefill', () => {
  it('puts the url on its own line after the text and derives a title', () => {
    const p = readPrefill(new URLSearchParams({ text: 'Pressure down 11 hPa', url: 'https://example.org/wx' }))
    expect(p.values.body).toBe('Pressure down 11 hPa\nhttps://example.org/wx')
    expect(p.values.title).toBe('Pressure down 11 hPa')
    expect(p.hasContent).toBe(true)
  })
  it('does not repeat a link already in the text, and drops unsafe ones', () => {
    const dup = readPrefill(new URLSearchParams({ title: 'T1', text: 'See https://example.org/x', url: 'https://example.org/x' }))
    expect(dup.values.body).toBe('See https://example.org/x')
    const evil = readPrefill(new URLSearchParams({ title: 'T2', url: 'javascript:alert(1)' }))
    expect(evil.values.body).toBeUndefined()
  })
  it('reports what was cut, counting a link appended after the text', () => {
    const p = readPrefill(new URLSearchParams({ title: 'x'.repeat(130), text: 'y'.repeat(3995), url: 'https://example.org/a' }))
    expect(p.dropped.title).toBe(10)
    expect(p.values.body?.length).toBeLessThanOrEqual(4000)
    expect(p.dropped.body).toBeGreaterThan(0)
    expect(readPrefill(new URLSearchParams({ title: 'T', text: 'B' })).dropped).toEqual({ title: 0, body: 0 })
  })
  it('limits lengths and ignores malformed station and draft params', () => {
    const p = readPrefill(new URLSearchParams({ title: 'x'.repeat(500), station: '<script>', draft: '../etc' }))
    expect(p.values.title).toHaveLength(120)
    expect(p.hasStation).toBe(false)
    expect(p.draftId).toBeNull()
    expect(readPrefill(new URLSearchParams({ station: 'krn-07', draft: 'dr-ab12' }))).toMatchObject({ hasStation: true, draftId: 'dr-ab12' })
  })
})
