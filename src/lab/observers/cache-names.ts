export interface ParsedCacheName {
  name: string
  /** Name without the version. */
  prefix: string
  version: number | null
  /** What the versions compete within: the prefix, plus any text after an infix version (Workbox puts the scope there). */
  group: string
}

/**
 * Finds a version in a cache name: '-v3' or '-3' at the end ('outpost-shell-v3'), or '-v3-' in the middle
 * ('workbox-precache-v2-https://site/'). Anything else is unversioned.
 */
export function parseCacheName(name: string): ParsedCacheName {
  const infix = /^(.*?)-v(\d+)-(.+)$/i.exec(name)
  if (infix?.[1] !== undefined && infix[2] !== undefined && infix[3] !== undefined) {
    return { name, prefix: infix[1], version: Number(infix[2]), group: `${infix[1]} ${infix[3]}` }
  }
  const suffix = /^(.+?)-v?(\d+)$/i.exec(name)
  if (suffix?.[1] !== undefined && suffix[2] !== undefined) return { name, prefix: suffix[1], version: Number(suffix[2]), group: suffix[1] }
  return { name, prefix: name, version: null, group: name }
}

export interface CacheGroupMember extends ParsedCacheName {
  /** Lower than the newest version in its group. */
  superseded: boolean
}

export interface CacheGroup {
  group: string
  prefix: string
  newest: number | null
  members: CacheGroupMember[]
}

/** Groups by prefix, newest version first inside each group. Groups are sorted by name. */
export function groupCaches(names: readonly string[]): CacheGroup[] {
  const byGroup = new Map<string, ParsedCacheName[]>()
  for (const name of names) {
    const parsed = parseCacheName(name)
    byGroup.set(parsed.group, [...(byGroup.get(parsed.group) ?? []), parsed])
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, parsed]) => {
      const versions = parsed.map((p) => p.version).filter((v): v is number => v !== null)
      const newest = versions.length > 0 ? Math.max(...versions) : null
      const members = parsed
        .map((p): CacheGroupMember => ({ ...p, superseded: newest !== null && p.version !== null && p.version < newest }))
        .sort((a, b) => (b.version ?? -1) - (a.version ?? -1) || a.name.localeCompare(b.name))
      return { group, prefix: parsed[0]?.prefix ?? group, newest, members }
    })
}

export const supersededNote = (newest: number): string => `older than v${newest} — your activate handler should delete this`
