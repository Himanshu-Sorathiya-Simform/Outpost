import type { Coords } from '@shared/contracts'

/** 'dp-000064' -> 64. Null when the id does not end in digits. */
export function dispatchNumber(id: string): number | null {
  const match = /(\d+)$/.exec(id)
  return match?.[1] ? Number(match[1]) : null
}

/** The register number printed on every line: 'Nº 0064'. Falls back to the raw id. */
export function dispatchIndex(id: string): string {
  const n = dispatchNumber(id)
  return n === null ? id : `Nº ${String(n).padStart(4, '0')}`
}

export const dispatchPath = (id: string): string => `/log/${encodeURIComponent(id)}`

const hemisphere = (value: number, positive: string, negative: string): string => `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`

/** '64.8733° N, 18.6124° W' */
export function formatCoords(coords: Coords): string {
  return `${hemisphere(coords.lat, 'N', 'S')}, ${hemisphere(coords.lng, 'E', 'W')}`
}

/** The body is stored as plain text; blank lines separate paragraphs. */
export function paragraphsOf(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}
