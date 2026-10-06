import { API_VERSION, type ReleasePatch, type ReleaseState } from '@shared/contracts'
import { compareVersions, parseSemver } from '@/lib'

/** The values the relay starts with (and returns to on reset). "Undo all" writes these back. */
export const DEFAULT_RELEASE: ReleaseState = { latestClient: '1.0.0', minClient: '1.0.0', api: API_VERSION, handbookEdition: '1988.4' }

/** The patch number after `version`, e.g. 1.4.2 -> 1.4.3. A string that is not semver is returned unchanged. */
export function nextPatch(version: string): string {
  const parsed = parseSemver(version)
  return parsed ? `${parsed.major}.${parsed.minor}.${parsed.patch + 1}` : version
}

const newer = (a: string, b: string): string => (compareVersions(a, b) === 1 ? a : b)

/** One above both the running build and the relay's latest, so the result is always a real update. */
export function publishTarget(running: string, latest: string): string {
  return nextPatch(newer(running, latest))
}

/** Publish: only latestClient moves. Tabs older than it see the update banner, none are blocked. */
export function publishPatch(running: string, latest: string): ReleasePatch {
  return { latestClient: publishTarget(running, latest) }
}

/**
 * Force: minClient rises above the running build, which is what blocks this tab. latestClient follows it, because a
 * relay that demands a version it has not published would contradict itself.
 */
export function forcePatch(running: string, latest: string): ReleasePatch {
  const target = compareVersions(latest, running) === 1 ? latest : nextPatch(running)
  return { latestClient: target, minClient: target }
}

/** '1988.4' -> '1988.5'. An edition that does not end in a number gets '.1' appended. */
export function nextEdition(edition: string): string {
  const match = /^(.*?)(\d+)$/.exec(edition)
  return match ? `${match[1] ?? ''}${Number(match[2]) + 1}` : `${edition}.1`
}
