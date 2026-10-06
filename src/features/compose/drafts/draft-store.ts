import { useEffect } from 'react'
import { create } from 'zustand'
import { notify } from '@/lib/notify'
import { safeLocal } from '@/lib/storage'
import { DRAFT_CAP, DRAFTS_KEY, byRecency, parseStoredDrafts, serializeDrafts, type Draft, type DraftInput, type DraftOrigin } from './draft-schema'

interface DraftsState {
  /** Newest edit first. */
  drafts: Draft[]
  /** False when the last write only reached memory (storage blocked or full): the drafts vanish with the tab. */
  persisted: boolean
}

function readStored(): Draft[] {
  const { drafts, corrupt } = parseStoredDrafts(safeLocal.get(DRAFTS_KEY))
  // Unreadable text is discarded so it cannot fail the same way on every load.
  if (corrupt) safeLocal.remove(DRAFTS_KEY)
  return drafts
}

export const useDraftStore = create<DraftsState>(() => ({ drafts: readStored(), persisted: true }))

/**
 * Every change is applied to what storage holds right now rather than to this tab's copy, so two tabs
 * editing different drafts cannot overwrite each other's work.
 */
function commit(change: (current: Draft[]) => Draft[]): void {
  const next = change(readStored()).sort(byRecency)
  const kept = next.slice(0, DRAFT_CAP)
  if (kept.length < next.length) {
    notify({
      tone: 'warn',
      title: 'Draft limit reached',
      message: `Only ${DRAFT_CAP} drafts are kept. The least recently edited one was dropped.`,
      key: 'draft-cap',
    })
  }
  const persisted = safeLocal.set(DRAFTS_KEY, serializeDrafts(kept))
  useDraftStore.setState({ drafts: kept, persisted })
}

function newDraftId(): string {
  return `dr-${Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export interface NewDraft {
  input: DraftInput
  origin: DraftOrigin
  /** The idempotency key this draft will always be sent under. */
  clientId: string
}

export const draftActions = {
  get: (id: string): Draft | undefined => useDraftStore.getState().drafts.find((d) => d.id === id),

  create({ input, origin, clientId }: NewDraft): Draft {
    const at = new Date().toISOString()
    const draft: Draft = { id: newDraftId(), createdAt: at, updatedAt: at, clientId, input, origin, lastError: null }
    commit((current) => [draft, ...current])
    return draft
  },

  /** Replaces the typed content and touches the draft. Returns undefined when it no longer exists (removed in another tab). */
  update(id: string, input: DraftInput): Draft | undefined {
    let updated: Draft | undefined
    commit((current) =>
      current.map((d) => {
        if (d.id !== id) return d
        updated = { ...d, input, updatedAt: new Date().toISOString() }
        return updated
      }),
    )
    return updated
  },

  /** Records what happened to a send. Does not count as an edit, so the list order stays put. */
  mark(id: string, patch: { origin?: DraftOrigin; lastError?: string | null }): void {
    commit((current) => current.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  },

  remove(id: string): void {
    commit((current) => current.filter((d) => d.id !== id))
  },
}

/** Another tab wrote the drafts: take its copy. */
function useCrossTabSync(): void {
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === DRAFTS_KEY || e.key === null) useDraftStore.setState({ drafts: readStored() })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
}

/** All drafts on this device, most recently edited first, kept in step with other tabs. */
export function useDrafts(): Draft[] {
  useCrossTabSync()
  return useDraftStore((s) => s.drafts)
}

export function useDraftsPersisted(): boolean {
  return useDraftStore((s) => s.persisted)
}
