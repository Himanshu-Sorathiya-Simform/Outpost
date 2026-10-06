import { z } from 'zod'
import { DispatchCreate, type Station } from '@shared/contracts'
import { LIMITS, readCoords, type FormValues } from './form-values'

/** Top to bottom, the order fields appear on the page and the order focus goes to an error. */
export const FIELD_ORDER = ['stationId', 'title', 'body', 'tags', 'coords'] as const
export type FieldKey = (typeof FIELD_ORDER)[number] | 'severity' | 'form'
export type FieldErrors = Partial<Record<FieldKey, string>>

const FIELD_LABEL: Record<FieldKey, string> = {
  stationId: 'Station',
  severity: 'Severity',
  title: 'Title',
  body: 'Body',
  tags: 'Tags',
  coords: 'Coordinates',
  form: 'Entry',
}

/** The part of a zod issue we read. Our own zod errors and the relay's `details` both fit. */
export interface IssueLike {
  path: readonly PropertyKey[]
  code?: string
  message?: string
  minimum?: unknown
  maximum?: unknown
  origin?: string
}

const ServerIssues = z.array(
  z.object({
    path: z.array(z.union([z.string(), z.number()])).default([]),
    code: z.string().optional(),
    message: z.string().optional(),
    minimum: z.unknown().optional(),
    maximum: z.unknown().optional(),
    origin: z.string().optional(),
  }),
)

/** `AppError.context.details` of a 422: the relay's zod issues, or nothing usable. */
export function issuesFromDetails(details: unknown): IssueLike[] {
  const parsed = ServerIssues.safeParse(details)
  return parsed.success ? parsed.data : []
}

function fieldOf(path: readonly PropertyKey[]): FieldKey {
  const head = path[0]
  if (head === 'stationId' || head === 'severity' || head === 'title' || head === 'body' || head === 'tags' || head === 'coords') return head
  return 'form'
}

function describe(field: FieldKey, issue: IssueLike): string {
  const label = FIELD_LABEL[field]
  const min = typeof issue.minimum === 'number' ? issue.minimum : undefined
  const max = typeof issue.maximum === 'number' ? issue.maximum : undefined
  if (issue.code === 'too_small') {
    if (issue.origin === 'array' || min === undefined || min <= 1) return field === 'body' ? 'Write something in the body.' : `${label} cannot be empty.`
    return `${label} needs at least ${min} characters.`
  }
  if (issue.code === 'too_big') {
    if (field === 'tags' && issue.path.length > 1) return `Tag ${Number(issue.path[1]) + 1} is over ${LIMITS.tagMax} characters.`
    if (field === 'tags') return `At most ${max ?? LIMITS.tags} tags.`
    return `${label} is over ${max ?? '?'} characters.`
  }
  if (issue.code === 'invalid_type') return `${label} is required.`
  return issue.message && issue.message !== 'Invalid input' ? issue.message : `${label} is not acceptable.`
}

/** First message per field wins. */
export function issuesToErrors(issues: readonly IssueLike[]): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of issues) {
    const field = fieldOf(issue.path)
    errors[field] ??= describe(field, issue)
  }
  return errors
}

export const hasErrors = (errors: FieldErrors): boolean => Object.keys(errors).length > 0

export const firstErrorField = (errors: FieldErrors): FieldKey | null =>
  FIELD_ORDER.find((f) => errors[f] !== undefined) ?? (errors.severity ? 'severity' : errors.form ? 'form' : null)

const STATION_CODE = /^[A-Za-z]{2,5}-\d{1,3}$/
const STATION_ID = /^st-[a-z0-9]+$/i

/** The station's id when the typed text matches a known station by id or code (any case). */
export function findStation(stations: readonly Station[] | undefined, typed: string): Station | undefined {
  const needle = typed.trim().toLowerCase()
  if (needle === '') return undefined
  return stations?.find((s) => s.id.toLowerCase() === needle || s.code.toLowerCase() === needle)
}

export type BuiltDispatch = { ok: true; input: z.output<typeof DispatchCreate> } | { ok: false; errors: FieldErrors }

export interface BuildContext {
  clientId: string
  /** When the operator pressed the button. The relay uses it as the filing time if it is not in the future. */
  filedAtClient: string
  /** The station list if it loaded; without it a typed code is checked for shape only. */
  stations: readonly Station[] | undefined
}

/** Validates the form as typed against the same DispatchCreate schema the relay uses. */
export function buildDispatch(v: FormValues, ctx: BuildContext): BuiltDispatch {
  const issues: IssueLike[] = []

  const station = findStation(ctx.stations, v.stationId)
  const typed = v.stationId.trim()
  let stationId = station?.id ?? typed
  if (typed === '') issues.push({ path: ['stationId'], message: 'Choose the station this comes from.' })
  else if (!station) {
    if (ctx.stations) issues.push({ path: ['stationId'], message: `No station "${typed}" on the list.` })
    else if (STATION_CODE.test(typed)) stationId = typed.toUpperCase()
    else if (!STATION_ID.test(typed)) issues.push({ path: ['stationId'], message: 'Enter a station code such as KRN-07.' })
  }

  const reading = readCoords(v.lat, v.lng)
  if (reading.kind === 'invalid') issues.push({ path: ['coords'], message: reading.message })

  const candidate = {
    clientId: ctx.clientId,
    stationId,
    title: v.title.trim(),
    body: v.body.trim(),
    severity: v.severity,
    tags: v.tags,
    coords: reading.kind === 'ok' ? reading.coords : null,
    filedAtClient: ctx.filedAtClient,
  }
  const parsed = DispatchCreate.safeParse(candidate)
  if (!parsed.success) {
    const stationFlagged = issues.some((i) => i.path[0] === 'stationId')
    issues.push(...parsed.error.issues.filter((i) => !(stationFlagged && i.path[0] === 'stationId')))
  }

  if (issues.length > 0 || !parsed.success) return { ok: false, errors: issuesToErrors(issues) }
  return { ok: true, input: parsed.data }
}
