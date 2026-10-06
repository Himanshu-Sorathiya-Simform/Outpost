import { create } from 'zustand'

/** Events kept. Older ones fall off the end. */
export const TIMELINE_CAP = 300

export type TimelineKind =
  | 'observer-started'
  | 'registration-added'
  | 'registration-removed'
  | 'updatefound'
  | 'statechange'
  | 'controllerchange'
  | 'ready'
  | 'message'
  | 'messageerror'

export interface TimelineEvent {
  id: number
  /** Epoch ms on this device's clock. */
  at: number
  kind: TimelineKind
  scope: string | null
  /** Path of the worker script involved, when there is one. */
  worker: string | null
  /** Worker state after a statechange, else null. */
  state: string | null
  detail: string
}

interface TimelineState {
  /** Newest first. */
  events: TimelineEvent[]
  push(event: Omit<TimelineEvent, 'id' | 'at'>): void
  clear(): void
}

let seq = 0

/**
 * Module-level on purpose: the observer starts at boot and writes here long before the Lab is opened, and the
 * list must survive route changes. It does not survive a reload (a reload is a new page, with a new history).
 */
export const useTimelineStore = create<TimelineState>((set) => ({
  events: [],
  push: (event) => set((s) => ({ events: [{ ...event, id: ++seq, at: Date.now() }, ...s.events].slice(0, TIMELINE_CAP) })),
  clear: () => set({ events: [] }),
}))

export const pushTimeline = (event: Omit<TimelineEvent, 'id' | 'at'>): void => useTimelineStore.getState().push(event)
export const clearWorkerTimeline = (): void => useTimelineStore.getState().clear()

/** Oldest first, with the gap to the previous event, for export. */
export function timelineToJson(events: readonly TimelineEvent[]): string {
  const ordered = [...events].reverse()
  const rows = ordered.map((e, i) => ({
    at: new Date(e.at).toISOString(),
    deltaMs: i === 0 ? null : e.at - (ordered[i - 1]?.at ?? e.at),
    kind: e.kind,
    scope: e.scope,
    worker: e.worker,
    state: e.state,
    detail: e.detail,
  }))
  return JSON.stringify({ page: location.href, exportedAt: new Date().toISOString(), events: rows }, null, 2)
}
