import { describe, expect, it } from 'vitest'
import { DRAFT_CAP, parseStoredDrafts, serializeDrafts, type Draft } from './draft-schema'

const draft = (n: number, patch: Partial<Draft> = {}): Draft => ({
  id: `dr-${n}`,
  createdAt: '2026-09-30T08:00:00.000Z',
  updatedAt: `2026-09-30T08:${String(n % 60).padStart(2, '0')}:00.000Z`,
  clientId: `client-id-${n}`,
  input: { title: `Draft ${n}` },
  origin: 'manual',
  lastError: null,
  ...patch,
})

describe('parseStoredDrafts', () => {
  it('reads nothing as an empty list', () => {
    expect(parseStoredDrafts(null)).toEqual({ drafts: [], corrupt: false, dropped: 0 })
  })

  it('round-trips, newest edit first', () => {
    const parsed = parseStoredDrafts(serializeDrafts([draft(1), draft(5), draft(3)]))
    expect(parsed.drafts.map((d) => d.id)).toEqual(['dr-5', 'dr-3', 'dr-1'])
    expect(parsed.corrupt).toBe(false)
  })

  it('treats bad JSON, a wrong version and a wrong shape as corrupt', () => {
    expect(parseStoredDrafts('{nope').corrupt).toBe(true)
    expect(parseStoredDrafts(JSON.stringify({ v: 2, drafts: [] })).corrupt).toBe(true)
    expect(parseStoredDrafts(JSON.stringify([draft(1)])).corrupt).toBe(true)
  })

  it('drops only the invalid and duplicate entries', () => {
    const raw = JSON.stringify({ v: 1, drafts: [draft(1), { id: 'x' }, draft(1), draft(2, { origin: 'nonsense' as Draft['origin'] }), draft(3)] })
    const parsed = parseStoredDrafts(raw)
    expect(parsed.drafts.map((d) => d.id).sort()).toEqual(['dr-1', 'dr-3'])
    expect(parsed.dropped).toBe(3)
    expect(parsed.corrupt).toBe(false)
  })

  it('applies the cap', () => {
    const many = Array.from({ length: DRAFT_CAP + 7 }, (_, i) => draft(i))
    expect(parseStoredDrafts(serializeDrafts(many)).drafts).toHaveLength(DRAFT_CAP)
  })
})
