/** The part of a worker the state word depends on. A real ServiceWorker satisfies it. */
export interface SlotLike {
  state: string
}

/** The three slots of a registration. A real ServiceWorkerRegistration satisfies it. */
export interface SlotsLike {
  installing: SlotLike | null
  waiting: SlotLike | null
  active: SlotLike | null
}

/**
 * One word for what the registration is doing, newest worker first: installing, then waiting, then active.
 * Lab → Worker compares usePwaStore.swState against exactly this order, so the two must not drift apart.
 * 'activating' is the one active-slot state that is not reported as 'active': the worker is not ready yet.
 */
export function describeSlots(slots: SlotsLike): string {
  if (slots.installing) return 'installing'
  if (slots.waiting) return 'waiting'
  if (slots.active) return slots.active.state === 'activated' ? 'active' : slots.active.state
  return 'none'
}
