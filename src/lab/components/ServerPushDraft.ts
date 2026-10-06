import type { Dispatch, PushKind, PushPayload } from '@shared/contracts'
import type { PushSendInput } from '@/lib/queries'

/** One notification button, as the payload carries it. */
export type PushAction = PushPayload['actions'][number]
export type PresetId = 'dispatch' | 'custom' | 'silent-badge' | 'sync-poke' | 'long-running' | 'actions'
export type BadgeMode = 'leave' | 'set' | 'none'
export type Urgency = 'very-low' | 'low' | 'normal' | 'high'

/** The send form. Numbers stay strings so a half-typed field is not rewritten under the cursor. */
export interface PushDraft {
  preset: PresetId
  dispatchId: string
  title: string
  body: string
  url: string
  tag: string
  badgeMode: BadgeMode
  badgeCount: string
  ttl: string
  urgency: Urgency | ''
  delaySec: string
  /** Last 12 characters of one subscription's endpoint, or '' for all. */
  target: string
  requireInteraction: boolean
  actions: PushAction[]
}

export interface PresetInfo {
  id: PresetId
  label: string
  kind: PushKind
  summary: string
}

export const PRESETS: PresetInfo[] = [
  { id: 'dispatch', label: 'New dispatch', kind: 'dispatch', summary: 'Kind dispatch. Title, body, url, tag and actions are filled from the dispatch you pick.' },
  { id: 'custom', label: 'Custom', kind: 'custom', summary: 'Kind custom. You write everything; a title is required.' },
  { id: 'silent-badge', label: 'Silent badge update', kind: 'silent-badge', summary: 'Silent. Nothing to show, only a badge count to apply.' },
  { id: 'sync-poke', label: 'Sync poke', kind: 'sync-poke', summary: 'Silent. A nudge to go and fetch: flush the outbox, refresh the digest.' },
  { id: 'long-running', label: 'Long-running', kind: 'custom', summary: 'Custom with requireInteraction: the notification stays until someone acts on it.' },
  { id: 'actions', label: 'With actions', kind: 'custom', summary: 'Custom with two action buttons. The worker hears which one in notificationclick.' },
]

export const kindOf = (preset: PresetId): PushKind => PRESETS.find((p) => p.id === preset)?.kind ?? 'custom'

const EMPTY: PushDraft = {
  preset: 'custom',
  dispatchId: '',
  title: '',
  body: '',
  url: '',
  tag: '',
  badgeMode: 'leave',
  badgeCount: '3',
  ttl: '',
  urgency: '',
  delaySec: '',
  target: '',
  requireInteraction: false,
  actions: [],
}

/** The form as it should look after picking a preset. `keep` carries over what is not preset-specific. */
export function presetDraft(preset: PresetId, keep: Pick<PushDraft, 'dispatchId' | 'target' | 'ttl' | 'urgency' | 'delaySec'>): PushDraft {
  const base: PushDraft = { ...EMPTY, ...keep, preset }
  switch (preset) {
    case 'dispatch':
      return base
    case 'custom':
      return { ...base, title: 'Relay check', body: 'Sent from the lab push console.', url: '/log' }
    case 'silent-badge':
      return { ...base, badgeMode: 'set', badgeCount: '7', url: '/inbox' }
    case 'sync-poke':
      return { ...base, url: '/log' }
    case 'long-running':
      return { ...base, title: 'Mast icing: acknowledge', body: 'This stays on screen until you act on it.', url: '/inbox', tag: 'long-running', requireInteraction: true, ttl: '3600', urgency: 'high' }
    case 'actions':
      return {
        ...base,
        title: 'Generator swap at KRN-07',
        body: 'Two buttons below. Which one you press arrives in notificationclick as event.action.',
        url: '/log',
        tag: 'with-actions',
        actions: [
          { action: 'open', title: 'Open' },
          { action: 'ack', title: 'Acknowledge' },
        ],
      }
  }
}

const trimmed = (s: string): string | undefined => (s.trim() === '' ? undefined : s.trim())
const wholeNumber = (s: string): number | undefined => {
  const n = Number(s)
  return s.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : undefined
}

const usableActions = (actions: PushAction[]): PushAction[] => actions.filter((a) => a.action.trim() !== '' && a.title.trim() !== '').slice(0, 2)

/** What goes in the POST body. Empty fields are left out, so the relay's defaults apply. */
export function buildRequest(draft: PushDraft): PushSendInput {
  const kind = kindOf(draft.preset)
  const badge = draft.badgeMode === 'none' ? null : draft.badgeMode === 'set' ? wholeNumber(draft.badgeCount) : undefined
  const actions = usableActions(draft.actions)
  const delay = wholeNumber(draft.delaySec)
  return {
    kind,
    title: trimmed(draft.title),
    body: trimmed(draft.body),
    url: trimmed(draft.url),
    tag: trimmed(draft.tag),
    dispatchId: kind === 'dispatch' ? trimmed(draft.dispatchId) : undefined,
    badgeCount: badge,
    actions: actions.length > 0 ? actions : undefined,
    requireInteraction: draft.requireInteraction ? true : undefined,
    ttl: wholeNumber(draft.ttl),
    urgency: draft.urgency === '' ? undefined : draft.urgency,
    delaySec: delay !== undefined && delay > 0 ? delay : undefined,
    targetEndpointTail: trimmed(draft.target),
  }
}

const LIMITS = { ttl: { label: 'TTL', max: 86_400 }, delaySec: { label: 'Delay', max: 300 } } as const

/** Per-field problems the relay would reject with a 422, worded for the field they belong to. */
export function fieldProblems(draft: PushDraft): Partial<Record<'ttl' | 'delaySec' | 'badgeCount', string>> {
  const out: Partial<Record<'ttl' | 'delaySec' | 'badgeCount', string>> = {}
  if (draft.badgeMode === 'set' && wholeNumber(draft.badgeCount) === undefined) out.badgeCount = 'The badge count must be a whole number.'
  for (const key of ['ttl', 'delaySec'] as const) {
    const value = draft[key]
    if (value.trim() === '') continue
    const n = wholeNumber(value)
    const { label, max } = LIMITS[key]
    if (n === undefined) out[key] = `${label} must be a whole number of seconds.`
    else if (n > max) out[key] = `${label} is at most ${max} seconds.`
  }
  return out
}

/** Why the form cannot be sent, or null. Mirrors what the relay rejects with a 422. */
export function draftProblem(draft: PushDraft): string | null {
  const kind = kindOf(draft.preset)
  if (kind === 'dispatch' && draft.dispatchId === '') return 'Pick a dispatch first.'
  if (kind === 'custom' && draft.title.trim() === '') return 'A custom push needs a title.'
  const fields = fieldProblems(draft)
  return fields.badgeCount ?? fields.ttl ?? fields.delaySec ?? null
}

export interface PreviewContext {
  /** Unread count the relay would fill in when the badge is left alone. */
  unread: number | undefined
  dispatch: Dispatch | undefined
}

const SERVER_FILLED = '(set by the relay when it sends)'

/**
 * The PushPayload the worker will receive, built from the form the way server/push.ts builds it. Values that depend
 * on the relay at send time are marked. The relay's answer after sending is the authority.
 */
export function buildPreview(draft: PushDraft, ctx: PreviewContext): PushPayload {
  const kind = kindOf(draft.preset)
  const req = buildRequest(draft)
  const silent = kind === 'silent-badge' || kind === 'sync-poke'
  const d = ctx.dispatch
  const badgeCount = req.badgeCount === undefined ? (ctx.unread ?? 0) : req.badgeCount
  const common = { v: 1 as const, kind, dispatchId: kind === 'dispatch' ? (req.dispatchId ?? null) : null, badgeCount, icon: '/icons/icon-192.png', image: null, silent, sentAt: SERVER_FILLED }

  switch (kind) {
    case 'dispatch':
      return {
        ...common,
        title: req.title ?? (d ? `${d.stationCode}: ${d.title}` : '(title of the dispatch)'),
        body: req.body ?? (d ? d.body.replace(/\s+/g, ' ').trim().slice(0, 140) : '(start of the dispatch body)'),
        url: req.url ?? `/log/${req.dispatchId ?? ''}`,
        tag: req.tag ?? (req.dispatchId ? `dispatch-${req.dispatchId}` : null),
        actions: req.actions ?? [
          { action: 'open', title: 'Open' },
          { action: 'ack', title: 'Acknowledge' },
        ],
        requireInteraction: req.requireInteraction ?? d?.severity === 'critical',
      }
    case 'custom':
      return { ...common, title: req.title ?? '', body: req.body ?? '', url: req.url ?? '/log', tag: req.tag ?? null, actions: req.actions ?? [], requireInteraction: req.requireInteraction ?? false }
    case 'silent-badge':
      return { ...common, title: req.title ?? 'Badge update', body: req.body ?? 'The unread count changed.', url: req.url ?? '/inbox', tag: req.tag ?? null, actions: [], requireInteraction: false }
    case 'sync-poke':
      return { ...common, title: req.title ?? 'Sync poke', body: req.body ?? 'The server has something new to fetch.', url: req.url ?? '/log', tag: req.tag ?? null, actions: [], requireInteraction: false }
  }
}
