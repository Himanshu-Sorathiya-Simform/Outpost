import { describe, expect, it } from 'vitest'
import { HANDLE_EXAMPLES, parseHandleUri } from './handle-uri'

const path = (raw: string | null): string | null => {
  const r = parseHandleUri(raw)
  return r.ok ? r.target.path : null
}

describe('parseHandleUri', () => {
  it('opens the three allowed resources and normalises case', () => {
    expect(path('web+outpost://dispatch/dp-000123')).toBe('/log/dp-000123')
    expect(path('WEB+OUTPOST://dispatch/DP-000123/')).toBe('/log/dp-000123')
    expect(path('web+outpost://station/krn-07')).toBe('/stations/KRN-07')
    expect(path('web+outpost://handbook/loss-of-contact-procedures')).toBe('/handbook/loss-of-contact-procedures')
  })

  it('accepts every documented example', () => {
    for (const { uri } of HANDLE_EXAMPLES) expect(parseHandleUri(uri).ok).toBe(true)
  })

  it('reports why an address is refused', () => {
    const why = (raw: string | null) => {
      const r = parseHandleUri(raw)
      return r.ok ? 'ok' : r.failure
    }
    expect(why(null)).toBe('missing')
    expect(why('   ')).toBe('missing')
    expect(why('https://evil.example/')).toBe('scheme')
    expect(why('javascript:alert(1)')).toBe('scheme')
    expect(why('web+outpost://settings/now')).toBe('resource')
    expect(why('web+outpost://dispatch')).toBe('resource')
    expect(why('web+outpost://dispatch/dp-12/extra')).toBe('resource')
    expect(why('web+outpost://dispatch/../../etc')).toBe('resource')
    expect(why('web+outpost://dispatch/dp-abc')).toBe('identifier')
    expect(why('web+outpost://station/K')).toBe('identifier')
    expect(why('web+outpost://dispatch/dp-%2e%2e')).toBe('encoded')
    expect(why(`web+outpost://dispatch/${'1'.repeat(300)}`)).toBe('too-long')
  })

  it('never lets anything but a matched identifier into the path', () => {
    for (const raw of [
      'web+outpost://dispatch/dp-1?next=//evil',
      'web+outpost://dispatch/dp-1#x',
      'web+outpost://handbook/a b',
      'web+outpost://station/KRN-07\n',
    ]) {
      const r = parseHandleUri(raw)
      if (r.ok) expect(r.target.path).toMatch(/^\/(log|stations|handbook)\/[A-Za-z0-9-]+$/)
    }
  })
})
