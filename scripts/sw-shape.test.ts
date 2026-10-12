import { describe, expect, it } from 'vitest'
import { shapeCheckFor } from '../src/sw/lib/shape'

const dispatch = { id: 'dp-000001', stationId: 'st-krn07', title: 'Power dip', filedAt: '2026-01-01T07:00:00.000Z', severity: 'urgent' }
const check = (path: string) => {
  const found = shapeCheckFor(path)
  if (!found) throw new Error(`no check for ${path}`)
  return found
}

describe('which answers are checked', () => {
  it.each(['/api/dispatches', '/api/dispatches/dp-000001', '/api/digest'])('%s has a check', (path) => {
    expect(shapeCheckFor(path)).toBeTypeOf('function')
  })
  it.each(['/api/inbox/summary', '/api/stations', '/api/dispatches/dp-000001/extra', '/api/dispatchesx', '/api/handbook'])('%s has none', (path) => {
    expect(shapeCheckFor(path)).toBeUndefined()
  })
})

describe('one dispatch', () => {
  const one = check('/api/dispatches/dp-000001')
  it('accepts the fields the app reads, with every severity', () => {
    for (const severity of ['routine', 'notice', 'urgent', 'critical']) expect(one({ ...dispatch, severity })).toBe(true)
  })
  it('refuses the drifted shape the server sends under Schema drift', () => {
    expect(one({ id: 'dp-000001', station_id: 'st-krn07', title: 'x', body: 'x', level: 3, filed_at: '2026-01-01T07:00:00.000Z' })).toBe(false)
  })
  it.each(['id', 'stationId', 'title', 'filedAt', 'severity'])('refuses one with no %s', (field) => {
    expect(one({ ...dispatch, [field]: undefined })).toBe(false)
  })
  it.each([[{ severity: 'catastrophic' }], [{ severity: 3 }], [{ id: 64 }], [{ title: null }]])('refuses wrong values: %j', (patch) => {
    expect(one({ ...dispatch, ...patch })).toBe(false)
  })
  it.each([null, undefined, 'text', 7, [], true])('refuses %j', (value) => {
    expect(one(value)).toBe(false)
  })
})

describe('a page of dispatches and the digest', () => {
  it.each(['/api/dispatches', '/api/digest'])('%s: accepts items that are all dispatches, and an empty list', (path) => {
    expect(check(path)({ items: [dispatch, dispatch] })).toBe(true)
    expect(check(path)({ items: [] })).toBe(true)
  })
  it.each(['/api/dispatches', '/api/digest'])('%s: refuses one bad item among good ones, a missing or non-array items, and a non-object', (path) => {
    expect(check(path)({ items: [dispatch, { id: 'dp-000002', station_id: 'x', level: 1 }] })).toBe(false)
    expect(check(path)({})).toBe(false)
    expect(check(path)({ items: 'nope' })).toBe(false)
    expect(check(path)(null)).toBe(false)
  })
})
