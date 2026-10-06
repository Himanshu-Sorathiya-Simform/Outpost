import { describe, expect, it } from 'vitest'
import { DEFAULT_RELEASE, forcePatch, nextEdition, nextPatch, publishPatch } from './ServerReleaseScenarios'

describe('release scenarios', () => {
  it('counts the patch number up and leaves non-semver strings alone', () => {
    expect(nextPatch('1.4.2')).toBe('1.4.3')
    expect(nextPatch('dev')).toBe('dev')
  })

  it('publishes one patch above whichever of running and latest is newer', () => {
    expect(publishPatch('1.0.0', '1.0.0')).toEqual({ latestClient: '1.0.1' })
    expect(publishPatch('1.0.0', '1.0.4')).toEqual({ latestClient: '1.0.5' })
    expect(publishPatch('1.2.0', '1.0.0')).toEqual({ latestClient: '1.2.1' })
  })

  it('forces an upgrade by raising minClient above the running build', () => {
    expect(forcePatch('1.0.0', '1.0.0')).toEqual({ latestClient: '1.0.1', minClient: '1.0.1' })
    expect(forcePatch('1.0.0', '1.3.0')).toEqual({ latestClient: '1.3.0', minClient: '1.3.0' })
  })

  it('bumps the handbook edition', () => {
    expect(nextEdition('1988.4')).toBe('1988.5')
    expect(nextEdition('1988.9')).toBe('1988.10')
    expect(nextEdition('draft')).toBe('draft.1')
  })

  it('has a default release that does not skew a current build', () => {
    expect(DEFAULT_RELEASE.minClient).toBe(DEFAULT_RELEASE.latestClient)
  })
})
