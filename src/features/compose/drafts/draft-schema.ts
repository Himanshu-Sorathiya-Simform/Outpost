import { z } from 'zod'
import { Coords, Severity } from '@shared/contracts'

export const DRAFTS_KEY = 'outpost.drafts'
export const DRAFTS_VERSION = 1
/** Most drafts kept on the device. Past this the oldest-touched one is dropped. */
export const DRAFT_CAP = 50

export const DRAFT_ORIGINS = ['manual', 'share', 'offline-failed', 'queued'] as const
/**
 * manual: typed here. share: arrived through the share target or a prefilled link.
 * offline-failed: a send was tried and the relay could not be reached. queued: handed to the outbox seam.
 */
export type DraftOrigin = (typeof DRAFT_ORIGINS)[number]

/** Lengths here are storage guards, deliberately looser than the API limits: a draft keeps what was typed even when it is too long to send. */
export const DRAFT_LIMITS = { title: 500, body: 20_000, tag: 100, tags: 50, coordText: 40 } as const

/** The form fields of a dispatch, all optional, as typed so far. */
export const DraftInput = z.object({
  stationId: z.string().max(64).optional(),
  severity: Severity.optional(),
  title: z.string().max(DRAFT_LIMITS.title).optional(),
  body: z.string().max(DRAFT_LIMITS.body).optional(),
  tags: z.array(z.string().max(DRAFT_LIMITS.tag)).max(DRAFT_LIMITS.tags).optional(),
  coords: Coords.nullable().optional(),
  /** What is in the coordinate boxes when it does not (yet) make a valid pair. */
  coordsText: z.object({ lat: z.string().max(DRAFT_LIMITS.coordText), lng: z.string().max(DRAFT_LIMITS.coordText) }).optional(),
})
export type DraftInput = z.infer<typeof DraftInput>

export const Draft = z.object({
  id: z.string().min(1).max(64),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** The idempotency key for this dispatch. Fixed for the life of the draft, so every retry is the same filing. */
  clientId: z.string().min(8).max(100),
  input: DraftInput,
  origin: z.enum(DRAFT_ORIGINS),
  lastError: z.string().max(500).nullable(),
})
export type Draft = z.infer<typeof Draft>

const Envelope = z.object({ v: z.literal(DRAFTS_VERSION), drafts: z.array(z.unknown()) })

export interface StoredDrafts {
  drafts: Draft[]
  /** The stored text was not a readable envelope (bad JSON, other version, wrong shape): none of it was used. */
  corrupt: boolean
  /** Entries inside a readable envelope that failed validation and were dropped. */
  dropped: number
}

/** Newest edit first. */
export const byRecency = (a: Draft, b: Draft): number => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)

/** Reads the stored text. One bad entry costs only itself; an unreadable envelope costs everything (and is reported as corrupt). */
export function parseStoredDrafts(raw: string | null): StoredDrafts {
  if (raw === null) return { drafts: [], corrupt: false, dropped: 0 }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { drafts: [], corrupt: true, dropped: 0 }
  }
  const envelope = Envelope.safeParse(json)
  if (!envelope.success) return { drafts: [], corrupt: true, dropped: 0 }
  const seen = new Set<string>()
  const drafts: Draft[] = []
  for (const entry of envelope.data.drafts) {
    const parsed = Draft.safeParse(entry)
    if (parsed.success && !seen.has(parsed.data.id)) {
      seen.add(parsed.data.id)
      drafts.push(parsed.data)
    }
  }
  return { drafts: drafts.sort(byRecency).slice(0, DRAFT_CAP), corrupt: false, dropped: envelope.data.drafts.length - drafts.length }
}

export function serializeDrafts(drafts: readonly Draft[]): string {
  return JSON.stringify({ v: DRAFTS_VERSION, drafts })
}
