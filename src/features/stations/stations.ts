import type { Station, StationKind, StationStatus } from '@shared/contracts'
import type { StatusTone } from '@/ui'

export const STATUS_TONE: Record<StationStatus, StatusTone> = { online: 'ok', degraded: 'warn', dark: 'error' }
export const STATUS_LABEL: Record<StationStatus, string> = { online: 'Online', degraded: 'Degraded', dark: 'Dark' }
export const KIND_LABEL: Record<StationKind, string> = {
  weather: 'Weather',
  seismic: 'Seismic',
  'radio-relay': 'Radio relay',
  glacier: 'Glacier',
  coastal: 'Coastal',
}

export type SortKey = 'status' | 'code' | 'name' | 'region' | 'kind' | 'crew' | 'elevation' | 'contact'
export type SortDir = 'asc' | 'desc'
export const SORT_KEYS: readonly SortKey[] = ['status', 'code', 'name', 'region', 'kind', 'crew', 'elevation', 'contact']
export const SORT_LABEL: Record<SortKey, string> = {
  status: 'Status',
  code: 'Code',
  name: 'Name',
  region: 'Region',
  kind: 'Kind',
  crew: 'Crew',
  elevation: 'Elevation',
  contact: 'Last contact',
}

export interface StationFilters {
  status: StationStatus | 'all'
  kind: StationKind | 'all'
  q: string
}

const STATUS_RANK: Record<StationStatus, number> = { online: 0, degraded: 1, dark: 2 }

export function filterStations(items: readonly Station[], { status, kind, q }: StationFilters): Station[] {
  const needle = q.trim().toLowerCase()
  return items.filter((s) => {
    if (status !== 'all' && s.status !== status) return false
    if (kind !== 'all' && s.kind !== kind) return false
    if (!needle) return true
    return [s.code, s.name, s.region, KIND_LABEL[s.kind]].some((field) => field.toLowerCase().includes(needle))
  })
}

function compare(a: Station, b: Station, key: SortKey): number {
  switch (key) {
    case 'status':
      return STATUS_RANK[a.status] - STATUS_RANK[b.status]
    case 'code':
      return a.code.localeCompare(b.code)
    case 'name':
      return a.name.localeCompare(b.name)
    case 'region':
      return a.region.localeCompare(b.region)
    case 'kind':
      return KIND_LABEL[a.kind].localeCompare(KIND_LABEL[b.kind])
    case 'crew':
      return a.crew - b.crew
    case 'elevation':
      return a.elevationM - b.elevationM
    case 'contact':
      return Date.parse(a.lastContactAt) - Date.parse(b.lastContactAt)
  }
}

export function sortStations(items: readonly Station[], key: SortKey, dir: SortDir): Station[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => sign * compare(a, b, key) || a.code.localeCompare(b.code))
}

/** station id -> short reasons the row differs from the previous response. */
export type StationChanges = ReadonlyMap<string, readonly string[]>

export const NO_CHANGES: StationChanges = new Map()

/** What moved between two responses. Only fields an operator would notice are compared. */
export function diffStations(previous: readonly Station[], next: readonly Station[]): StationChanges {
  const before = new Map(previous.map((s) => [s.id, s]))
  const changes = new Map<string, string[]>()
  for (const s of next) {
    const old = before.get(s.id)
    if (!old) {
      changes.set(s.id, ['new on the register'])
      continue
    }
    const reasons: string[] = []
    if (old.status !== s.status) reasons.push(`${STATUS_LABEL[old.status].toLowerCase()} to ${STATUS_LABEL[s.status].toLowerCase()}`)
    if (old.lastContactAt !== s.lastContactAt) reasons.push('new contact time')
    if (old.crew !== s.crew) reasons.push(`crew ${old.crew} to ${s.crew}`)
    if (reasons.length > 0) changes.set(s.id, reasons)
  }
  return changes
}

export const formatElevation = (m: number): string => `${Math.round(m).toLocaleString('en-GB')} m`
