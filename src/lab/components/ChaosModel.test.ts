import { describe, expect, it } from 'vitest'
import type { ChaosRule, ChaosState } from '@shared/contracts'
import { blankRule, chaosIsActive, duplicateRule, errorCount, matchRule, move, shadowedBy, validateRule, validateState } from './ChaosModel'
import { predict } from './ChaosProbeRun'
import { observedCount, tally, type ProbeAttempt } from './ChaosProbeStore'
import { PROBE_TARGETS, targetById } from './ChaosProbeTargets'

const rule = (over: Partial<ChaosRule> = {}): ChaosRule => ({ ...blankRule([]), enabled: true, ...over })
const state = (rules: ChaosRule[], over: Partial<ChaosState> = {}): ChaosState => ({ serverOffline: false, schemaDrift: false, rules, ...over })

describe('matchRule', () => {
  it('picks the first enabled rule whose method and prefix match', () => {
    const s = state([rule({ id: 'a', enabled: false }), rule({ id: 'b', method: 'POST' }), rule({ id: 'c', pathPrefix: '/api/dispatches' }), rule({ id: 'd' })])
    const v = matchRule(s, 'GET', '/api/dispatches?limit=3')
    expect(v.kind === 'rule' && v.rule.id).toBe('c')
  })

  it('treats HEAD as GET, like the server', () => {
    const v = matchRule(state([rule({ method: 'GET' })]), 'HEAD', '/api/ping')
    expect(v.kind).toBe('rule')
  })

  it('exempts lab paths and lets the offline switch beat every rule', () => {
    expect(matchRule(state([rule()], { serverOffline: true }), 'GET', '/api/_lab/state').kind).toBe('exempt')
    expect(matchRule(state([rule()], { serverOffline: true }), 'GET', '/api/ping').kind).toBe('offline')
    expect(matchRule(state([rule({ pathPrefix: '/assets/' })]), 'GET', '/api/ping').kind).toBe('none')
  })
})

describe('shadowedBy', () => {
  it('flags a rule that an earlier broader rule always reaches first, whatever its probability', () => {
    const rules = [rule({ id: 'wide', pathPrefix: '/api', probability: 0.1 }), rule({ id: 'narrow', pathPrefix: '/api/signal' })]
    expect(shadowedBy(rules, 1)).toBe(0)
    expect(shadowedBy(rules, 0)).toBeNull()
  })

  it('does not flag across methods or disabled rules', () => {
    expect(shadowedBy([rule({ method: 'POST' }), rule({ method: 'GET' })], 1)).toBeNull()
    expect(shadowedBy([rule({ enabled: false }), rule({})], 1)).toBeNull()
  })
})

describe('validation', () => {
  it('accepts a blank rule', () => {
    const r = blankRule([])
    expect(validateRule(r, [r])).toEqual({})
  })

  it('names the field and the range that failed', () => {
    const r = rule({ probability: 1.5, latencyMs: -1, status: 200, pathPrefix: 'api' })
    const errors = validateRule(r, [r])
    expect(errors.probability).toMatch(/0 to 1/)
    expect(errors.latencyMs).toMatch(/0 to 60000/)
    expect(errors.status).toMatch(/400 to 599/)
    expect(errors.pathPrefix).toMatch(/start with \//)
  })

  it('catches empty labels, duplicate ids and the exempt lab prefix', () => {
    const a = rule({ id: 'x', label: '  ' })
    const b = rule({ id: 'x', pathPrefix: '/api/_lab/chaos' })
    const errors = validateState(state([a, b]))
    expect(errors[0]?.label).toBeDefined()
    expect(errors[0]?.id).toBeDefined()
    expect(errors[1]?.pathPrefix).toMatch(/exempt/)
    expect(errorCount(errors)).toBeGreaterThanOrEqual(4)
  })

  it('rejects NaN from an emptied number box', () => {
    const r = rule({ latencyMs: Number.NaN })
    expect(validateRule(r, [r]).latencyMs).toBeDefined()
  })
})

describe('list edits', () => {
  it('moves, duplicates with a fresh id and reports activity', () => {
    expect(move([1, 2, 3], 0, 2)).toEqual([2, 3, 1])
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3])
    const a = rule({ id: 'custom-2' })
    const copy = duplicateRule(a, [a])
    expect(copy.id).not.toBe(a.id)
    expect(copy.enabled).toBe(false)
    expect(chaosIsActive(state([copy]))).toBe(false)
    expect(chaosIsActive(state([a]))).toBe(true)
    expect(chaosIsActive(state([], { schemaDrift: true }))).toBe(true)
  })
})

describe('probe prediction and ledger', () => {
  const dispatches = targetById('dispatches')
  const asset = PROBE_TARGETS.find((t) => t.id === 'media')

  it('predicts the rule that would fire and the kinds that count as the symptom', () => {
    const s = state([rule({ label: 'Corrupt', mode: 'corrupt-json' })])
    expect(predict(s, dispatches, '/api/dispatches?limit=12')[0]).toMatchObject({ key: 'corrupt-json', expected: ['parse'] })
  })

  it('does not expect a body symptom from a headers-only probe', () => {
    const s = state([rule({ pathPrefix: '/media/', mode: 'corrupt-json' })])
    expect(predict(s, asset ?? dispatches, '/media/station/KRN-07.svg')).toEqual([])
  })

  it('expects a timeout from a slow pass rule when the give-up time is shorter than the wait', () => {
    const slow = state([rule({ mode: 'pass', latencyMs: 4000, jitterMs: 5000 })])
    expect(predict(slow, dispatches, '/api/dispatches?limit=12', 2000)[0]?.expected).toEqual(['timeout'])
    expect(predict(slow, dispatches, '/api/dispatches?limit=12', 6000)[0]?.expected).toEqual(['ok', 'timeout'])
    expect(predict(slow, dispatches, '/api/dispatches?limit=12', 15000)[0]?.expected).toEqual(['ok'])
    expect(predict(slow, dispatches, '/api/dispatches?limit=12', 0)[0]?.expected).toEqual(['ok'])
  })

  it('adds schema drift for dispatch requests only', () => {
    const s = state([], { schemaDrift: true })
    expect(predict(s, dispatches, '/api/dispatches?limit=12').map((p) => p.key)).toEqual(['schema-drift'])
    expect(predict(s, targetById('stations'), '/api/stations')).toEqual([])
  })

  it('counts only attempts whose outcome matched the expected kind', () => {
    const base = { at: 0, targetId: 'dispatches', targetLabel: 'Dispatch list', method: 'GET', path: '/api/dispatches', body: true }
    const p = [{ key: 'corrupt-json' as const, label: 'Corrupt', expected: ['parse'], chance: 1 }]
    const attempts: ProbeAttempt[] = [
      { ...base, id: 1, predictions: p, outcome: { ok: false, kind: 'parse', status: 200, durationMs: 9, chaos: 'Corrupt', userMessage: '', message: '' } },
      { ...base, id: 2, predictions: p, outcome: { ok: true, status: 200, source: 'network', durationMs: 9, chaos: null } },
    ]
    expect(observedCount(attempts, 'corrupt-json')).toBe(1)
    expect(observedCount(attempts, 'hang')).toBe(0)
    expect(tally(attempts)).toEqual([{ key: 'ok', count: 1 }, { key: 'parse', count: 1 }])
  })
})
