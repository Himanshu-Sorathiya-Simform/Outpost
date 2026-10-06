import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { newClientId } from '@/lib/queries'
import { BLANK_VALUES, draftInputFromValues, isBlankEntry, valuesFromDraft, type FormValues } from '../form/form-values'
import { readPrefill, type Dropped } from '../form/prefill'
import type { Draft, DraftOrigin } from './draft-schema'
import { draftActions } from './draft-store'

/** Quiet time after the last keystroke before the draft is written. */
export const AUTOSAVE_DELAY_MS = 600

interface Start {
  values: FormValues
  draftId: string | null
  clientId: string
  origin: DraftOrigin
  /** The draft this form resumed, if `?draft=` named one that exists. */
  resumed: Draft | undefined
  /** `?draft=` named one that does not. */
  missing: boolean
  /** The entry begins with words from a link or share sheet. */
  fromLink: boolean
  /** A station came in the link; dropped later if it is not on the list. */
  stationFromLink: boolean
  /** Characters of the incoming link that did not fit. */
  dropped: Dropped
}

const NOTHING_DROPPED: Dropped = { title: 0, body: 0 }

function start(params: URLSearchParams): Start {
  const prefill = readPrefill(params)
  const resumed = prefill.draftId ? draftActions.get(prefill.draftId) : undefined
  if (resumed) {
    return {
      values: valuesFromDraft(resumed.input),
      draftId: resumed.id,
      clientId: resumed.clientId,
      origin: resumed.origin,
      resumed,
      missing: false,
      fromLink: false,
      stationFromLink: false,
      dropped: NOTHING_DROPPED,
    }
  }
  return {
    values: { ...BLANK_VALUES, ...prefill.values },
    draftId: null,
    // One key for this whole entry, however many times it is sent or queued.
    clientId: newClientId(),
    origin: prefill.hasContent ? 'share' : 'manual',
    resumed: undefined,
    missing: prefill.draftId !== null,
    fromLink: prefill.hasContent,
    stationFromLink: prefill.hasStation,
    dropped: prefill.dropped,
  }
}

export interface ComposeDraft {
  values: FormValues
  edit: (patch: Partial<FormValues>) => void
  clientId: string
  draftId: string | null
  /** Epoch ms of the last write to the device. */
  savedAt: number | null
  resumed: Draft | undefined
  missing: boolean
  fromLink: boolean
  stationFromLink: boolean
  dropped: Dropped
  /** Write the draft now and return its id (null while the entry is still empty). */
  flush: () => string | null
  /** Delete the draft and stop autosaving. */
  discard: () => void
  /** The dispatch is on the relay: stop autosaving so leaving the page does not bring the draft back. */
  close: () => void
}

/**
 * The compose form's state and its local draft. Every edit is written to the device after a short pause, again when
 * the page is hidden or closed, and again on unmount, so a reload, a crash or a dead link never costs what was typed.
 */
export function useComposeDraft(): ComposeDraft {
  const [params] = useSearchParams()
  const [init] = useState(() => start(params))
  const [values, setValues] = useState(init.values)
  const [draftId, setDraftId] = useState(init.draftId)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const valuesRef = useRef(init.values)
  const draftIdRef = useRef(init.draftId)
  const dirty = useRef(init.fromLink && init.draftId === null)
  const closed = useRef(false)

  const save = useCallback((): string | null => {
    if (closed.current) return draftIdRef.current
    const v = valuesRef.current
    const input = draftInputFromValues(v)
    let id = draftIdRef.current
    // Gone from storage (removed in another tab): write it again under the same key.
    if (id && !draftActions.update(id, input)) id = null
    if (!id) {
      if (isBlankEntry(v)) return null
      id = draftActions.create({ input, origin: init.origin, clientId: init.clientId }).id
    }
    draftIdRef.current = id
    dirty.current = false
    setDraftId(id)
    setSavedAt(Date.now())
    return id
  }, [init])

  const edit = useCallback((patch: Partial<FormValues>): void => {
    valuesRef.current = { ...valuesRef.current, ...patch }
    dirty.current = true
    setValues(valuesRef.current)
  }, [])

  // Debounced autosave. Also runs once at the start for an entry that arrived from a link, so it is kept at once.
  useEffect(() => {
    if (!dirty.current) return
    const timer = window.setTimeout(() => save(), AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [values, save])

  // Anything pending is written when the page is hidden, closed, or left.
  useEffect(() => {
    const flushPending = (): void => {
      if (dirty.current) save()
    }
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') flushPending()
    }
    window.addEventListener('pagehide', flushPending)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flushPending)
      document.removeEventListener('visibilitychange', onHide)
      flushPending()
    }
  }, [save])

  const discard = useCallback((): void => {
    closed.current = true
    if (draftIdRef.current) draftActions.remove(draftIdRef.current)
  }, [])

  const close = useCallback((): void => {
    closed.current = true
  }, [])

  return {
    values,
    edit,
    clientId: init.clientId,
    draftId,
    savedAt,
    resumed: init.resumed,
    missing: init.missing,
    fromLink: init.fromLink,
    stationFromLink: init.stationFromLink,
    dropped: init.dropped,
    flush: save,
    discard,
    close,
  }
}
