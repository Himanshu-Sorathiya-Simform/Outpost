import { describe, expect, it } from 'vitest'
import { groupCaches, parseCacheName, supersededNote } from './cache-names'

describe('parseCacheName', () => {
  it('reads -v<n> and -<n> suffixes', () => {
    expect(parseCacheName('outpost-shell-v3')).toMatchObject({ prefix: 'outpost-shell', version: 3, group: 'outpost-shell' })
    expect(parseCacheName('runtime-12')).toMatchObject({ prefix: 'runtime', version: 12 })
  })

  it('reads an infix version and keeps the trailing scope in the group', () => {
    const parsed = parseCacheName('workbox-precache-v2-https://site.test/')
    expect(parsed).toMatchObject({ prefix: 'workbox-precache', version: 2 })
    expect(parsed.group).toBe('workbox-precache https://site.test/')
  })

  it('treats names without a version as unversioned', () => {
    expect(parseCacheName('misc')).toMatchObject({ prefix: 'misc', version: null, group: 'misc' })
    expect(parseCacheName('vendor-bundle').version).toBeNull()
  })
})

describe('groupCaches', () => {
  it('flags every version below the newest in its group', () => {
    const groups = groupCaches(['shell-v1', 'shell-v4', 'shell-v2', 'api', 'data-v1'])
    const shell = groups.find((g) => g.prefix === 'shell')
    expect(shell?.newest).toBe(4)
    expect(shell?.members.map((m) => [m.name, m.superseded])).toEqual([
      ['shell-v4', false],
      ['shell-v2', true],
      ['shell-v1', true],
    ])
    expect(groups.find((g) => g.prefix === 'api')?.members[0]?.superseded).toBe(false)
    expect(groups.find((g) => g.prefix === 'data')?.members[0]?.superseded).toBe(false)
  })

  it('words the note the way the page prints it', () => {
    expect(supersededNote(4)).toBe('older than v4 — your activate handler should delete this')
  })
})
