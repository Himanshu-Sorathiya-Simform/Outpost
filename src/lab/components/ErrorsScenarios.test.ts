import { describe, expect, it } from 'vitest'
import { APP_ERROR_KINDS } from '@/lib'
import { SCENARIOS } from './ErrorsScenarios'

describe('error simulator scenarios', () => {
  it('covers every AppErrorKind exactly once', () => {
    expect(SCENARIOS.map((s) => s.kind)).toEqual([...APP_ERROR_KINDS])
  })

  it('gives every scenario a mechanism and at least one action with a unique id', () => {
    for (const s of SCENARIOS) {
      expect(s.how.length).toBeGreaterThan(20)
      expect(s.actions.length).toBeGreaterThan(0)
      expect(new Set(s.actions.map((a) => a.id)).size).toBe(s.actions.length)
    }
  })

  it('marks the constructed scenarios synthetic and the provoked ones real', () => {
    const synthetic = SCENARIOS.filter((s) => !s.real).map((s) => s.kind)
    expect(synthetic).toEqual(['offline', 'cache-miss', 'permission', 'unsupported', 'quota', 'unknown'])
  })
})
