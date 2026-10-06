import { describe, expect, it } from 'vitest'
import { compareSemver, compareVersions, isOlder, parseSemver } from './semver'

describe('parseSemver', () => {
  it('parses releases, prereleases, build metadata and a leading v', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] })
    expect(parseSemver('v10.0.0-beta.2+build.5')).toEqual({ major: 10, minor: 0, patch: 0, prerelease: ['beta', '2'] })
    expect(parseSemver(' 0.0.1 ')).toMatchObject({ patch: 1 })
  })

  it.each(['', '1', '1.2', '1.2.3.4', '01.2.3', '1.2.x', 'latest', '1.2.3-', '1.2.3-beta..1'])('rejects %j', (input) => {
    expect(parseSemver(input)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders numerically, not lexically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1)
    expect(compareVersions('2.0.0', '10.0.0')).toBe(-1)
  })

  it('follows the semver.org prerelease ladder', () => {
    const ladder = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0']
    for (let i = 0; i < ladder.length - 1; i += 1) {
      expect(compareVersions(ladder[i] as string, ladder[i + 1] as string)).toBe(-1)
      expect(compareVersions(ladder[i + 1] as string, ladder[i] as string)).toBe(1)
    }
  })

  it('ignores build metadata', () => {
    expect(compareVersions('1.0.0+a', '1.0.0+b')).toBe(0)
  })

  it('is null when either side is not semver', () => {
    expect(compareVersions('1.0.0', 'nightly')).toBeNull()
    expect(compareVersions('x', '1.0.0')).toBeNull()
  })

  it('compareSemver works on parsed values', () => {
    const a = parseSemver('1.2.3')
    const b = parseSemver('1.2.4')
    if (!a || !b) throw new Error('parse')
    expect(compareSemver(a, b)).toBe(-1)
  })
})

describe('isOlder', () => {
  it('is strict, and false when unparsable', () => {
    expect(isOlder('1.0.0', '1.0.1')).toBe(true)
    expect(isOlder('1.0.1', '1.0.1')).toBe(false)
    expect(isOlder('1.0.1', '1.0.0')).toBe(false)
    expect(isOlder('junk', '1.0.0')).toBe(false)
  })
})
