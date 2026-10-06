import type { Coords, Severity } from '@shared/contracts'
import { DRAFT_LIMITS, type DraftInput } from '../drafts/draft-schema'

/** The form as typed: everything a person can put in a box is text until it is validated. */
export interface FormValues {
  /** A station id or code. Normalised to an id when the station list is available. */
  stationId: string
  severity: Severity
  title: string
  body: string
  tags: string[]
  lat: string
  lng: string
}

export const BLANK_VALUES: FormValues = { stationId: '', severity: 'routine', title: '', body: '', tags: [], lat: '', lng: '' }

export const LIMITS = { titleMin: 3, titleMax: 120, bodyMax: 4000, tagMax: 24, tags: 8 } as const

/** Decimal degrees typed by a person: dot or comma, surrounding spaces ignored. */
export function parseDegrees(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (t === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export type CoordsReading = { kind: 'none' } | { kind: 'ok'; coords: Coords } | { kind: 'invalid'; message: string }

/** Both boxes empty is fine (no position). One box, garbage or an impossible angle is not. */
export function readCoords(lat: string, lng: string): CoordsReading {
  const blankLat = lat.trim() === ''
  const blankLng = lng.trim() === ''
  if (blankLat && blankLng) return { kind: 'none' }
  if (blankLat || blankLng) return { kind: 'invalid', message: `Coordinates come as a pair. ${blankLat ? 'Latitude' : 'Longitude'} is empty.` }
  const la = parseDegrees(lat)
  const ln = parseDegrees(lng)
  if (la === null) return { kind: 'invalid', message: 'Latitude is not a number. Use decimal degrees, for example 61.2181.' }
  if (ln === null) return { kind: 'invalid', message: 'Longitude is not a number. Use decimal degrees, for example -149.9003.' }
  if (la < -90 || la > 90) return { kind: 'invalid', message: 'Latitude must be between -90 and 90.' }
  if (ln < -180 || ln > 180) return { kind: 'invalid', message: 'Longitude must be between -180 and 180.' }
  return { kind: 'ok', coords: { lat: la, lng: ln } }
}

export function valuesFromDraft(input: DraftInput): FormValues {
  return {
    stationId: input.stationId ?? '',
    severity: input.severity ?? 'routine',
    title: input.title ?? '',
    body: input.body ?? '',
    tags: input.tags ?? [],
    lat: input.coords ? String(input.coords.lat) : (input.coordsText?.lat ?? ''),
    lng: input.coords ? String(input.coords.lng) : (input.coordsText?.lng ?? ''),
  }
}

const clip = (text: string, max: number): string => (text.length > max ? text.slice(0, max) : text)

/** What gets stored. Nothing is validated or trimmed away: a draft holds exactly what was typed. */
export function draftInputFromValues(v: FormValues): DraftInput {
  const reading = readCoords(v.lat, v.lng)
  const input: DraftInput = {
    stationId: clip(v.stationId, 64),
    severity: v.severity,
    title: clip(v.title, DRAFT_LIMITS.title),
    body: clip(v.body, DRAFT_LIMITS.body),
    tags: v.tags.slice(0, DRAFT_LIMITS.tags).map((t) => clip(t, DRAFT_LIMITS.tag)),
  }
  if (reading.kind === 'ok') input.coords = reading.coords
  else if (reading.kind === 'invalid') input.coordsText = { lat: clip(v.lat, DRAFT_LIMITS.coordText), lng: clip(v.lng, DRAFT_LIMITS.coordText) }
  return input
}

/** Nothing worth keeping yet: a chosen station or severity alone does not make a draft. */
export function isBlankEntry(v: FormValues): boolean {
  return v.title.trim() === '' && v.body.trim() === '' && v.tags.length === 0 && v.lat.trim() === '' && v.lng.trim() === ''
}
