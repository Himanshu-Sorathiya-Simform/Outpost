export interface Semver {
  major: number
  minor: number
  patch: number
  /** Dot-separated identifiers after '-', e.g. ['beta', '2']. Empty for a release. */
  prerelease: string[]
}

const SEMVER = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

/** Parses MAJOR.MINOR.PATCH[-prerelease][+build], tolerating a leading 'v'. Anything else is null. */
export function parseSemver(input: string): Semver | null {
  const m = SEMVER.exec(input.trim())
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease: m[4] ? m[4].split('.') : [] }
}

const isNumeric = (id: string): boolean => /^\d+$/.test(id)

function comparePrerelease(a: string[], b: string[]): number {
  // A release outranks any prerelease of the same version.
  if (a.length === 0 || b.length === 0) return a.length === 0 ? (b.length === 0 ? 0 : 1) : -1
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) return -1 // fewer identifiers sorts first
    if (y === undefined) return 1
    if (x === y) continue
    if (isNumeric(x) && isNumeric(y)) return Number(x) < Number(y) ? -1 : 1
    if (isNumeric(x)) return -1 // numeric identifiers sort before alphanumeric ones
    if (isNumeric(y)) return 1
    return x < y ? -1 : 1
  }
  return 0
}

/** -1, 0 or 1 per semver.org precedence (build metadata ignored). */
export function compareSemver(a: Semver, b: Semver): -1 | 0 | 1 {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  }
  const pre = comparePrerelease(a.prerelease, b.prerelease)
  return pre < 0 ? -1 : pre > 0 ? 1 : 0
}

/** Compares two version strings; null when either is not valid semver (callers decide what "unknown" means). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  return pa && pb ? compareSemver(pa, pb) : null
}

/** True only when both parse and `a` is strictly older than `b`. */
export function isOlder(a: string, b: string): boolean {
  return compareVersions(a, b) === -1
}
