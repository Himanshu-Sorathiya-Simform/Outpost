import { useState } from 'react'
import type { Station, StationList } from '@shared/contracts'
import { NO_CHANGES, diffStations, type StationChanges } from './stations'

interface Seen {
  updatedAt: number
  items: readonly Station[] | undefined
  changes: StationChanges
  /** Counts revalidations that changed something; keys the stamps so each new batch replays its animation. */
  batch: number
}

export interface StationChangeSet {
  changes: StationChanges
  batch: number
}

/**
 * What the latest response changed relative to the one before it: the visible moment a stale-while-revalidate
 * second answer lands. Driven by `dataUpdatedAt` (it moves once per successful fetch), compared during render against
 * the previous list held in state. No timers: the stamps fade with CSS, and the set persists until something else changes.
 */
export function useStationChanges(data: StationList | undefined, dataUpdatedAt: number): StationChangeSet {
  const [seen, setSeen] = useState<Seen>({ updatedAt: dataUpdatedAt, items: data?.items, changes: NO_CHANGES, batch: 0 })

  if (data && dataUpdatedAt !== seen.updatedAt) {
    const changes = seen.items ? diffStations(seen.items, data.items) : NO_CHANGES
    const moved = changes.size > 0
    setSeen({ updatedAt: dataUpdatedAt, items: data.items, changes: moved ? changes : seen.changes, batch: moved ? seen.batch + 1 : seen.batch })
  }
  return { changes: seen.changes, batch: seen.batch }
}
