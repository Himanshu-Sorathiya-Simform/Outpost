import { useCallback, useEffect, useRef, useState } from 'react'
import type { DispatchPatch } from '@shared/contracts'
import { AppError, type AppErrorKind } from '@/lib/errors/app-error'
import { notify } from '@/lib/notify'
import { usePatchDispatch, useSession, useSessionPrompt } from '@/lib/queries'

export type PatchField = keyof DispatchPatch

/** These already have a voice: the hook raises the conflict toast and opens the clock-in dialog itself. */
const HANDLED_BY_HOOK: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>(['conflict', 'unauthorized', 'aborted'])

/** Clock-in closes its dialog a beat before the session query reports the new shift. */
const DISMISS_GRACE_MS = 500

/** A write the relay refused for want of a shift, kept so it can be sent once there is one. */
interface Stashed {
  id: string
  patch: DispatchPatch
  /** The shift (`issuedAt`) that was refused, or null when none was active. A different shift releases the write. */
  refusedUnder: string | null
}

const slot = (id: string, field: PatchField): string => `${id}:${field}`
const fieldsOf = (patch: DispatchPatch): PatchField[] => (Object.keys(patch) as PatchField[]).filter((f) => patch[f] !== undefined)

export interface ChangeOptions {
  /** A background write (auto mark-as-read): a failure is not announced. */
  quiet?: boolean
}

export interface DispatchPatcher {
  /** Optimistic write. Resolves true when the server accepted it; never rejects. */
  change(id: string, patch: DispatchPatch, options?: ChangeOptions): Promise<boolean>
  /** A write to this field of this dispatch is still on the wire. */
  isPending(id: string, field: PatchField): boolean
}

/**
 * usePatchDispatch plus what the screens need around it: which field of which dispatch is still in flight
 * (TanStack only reports the latest call), and a spoken failure for writes the operator asked for.
 * Patches run one at a time, so a burst of taps queues up rather than racing. A write refused with 401 (the clock-in
 * dialog is open) is kept and sent again when a new shift starts, so "Clock in to continue" is a promise that holds.
 */
export function useDispatchPatcher(): DispatchPatcher {
  const { mutateAsync } = usePatchDispatch()
  const shiftId = useSession().data?.session?.issuedAt ?? null
  const promptOpen = useSessionPrompt((p) => p.open)
  const [stashed, setStashed] = useState<Stashed | null>(null)
  const [inFlight, setInFlight] = useState<Readonly<Record<string, number>>>({})

  const count = useCallback((id: string, patch: DispatchPatch, delta: 1 | -1): void => {
    setInFlight((prev) => {
      const next = { ...prev }
      for (const field of fieldsOf(patch)) {
        const key = slot(id, field)
        const n = (next[key] ?? 0) + delta
        if (n > 0) next[key] = n
        else delete next[key]
      }
      return next
    })
  }, [])

  const change = useCallback(
    async (id: string, patch: DispatchPatch, options: ChangeOptions = {}): Promise<boolean> => {
      count(id, patch, 1)
      try {
        await mutateAsync({ id, patch })
        return true
      } catch (error) {
        const failure = AppError.is(error) ? error : null
        if (failure?.kind === 'unauthorized' && !options.quiet) setStashed({ id, patch, refusedUnder: shiftRef.current })
        if (!options.quiet && !(failure && HANDLED_BY_HOOK.has(failure.kind))) {
          notify({
            key: `dispatch-patch-failed:${id}`,
            tone: 'warn',
            title: 'Change not saved',
            message: `${failure?.userMessage ?? 'The relay did not take it.'} The previous value is back on screen.`,
          })
        }
        return false
      } finally {
        count(id, patch, -1)
      }
    },
    [mutateAsync, count],
  )

  const shiftRef = useRef(shiftId)
  const changeRef = useRef(change)
  useEffect(() => {
    shiftRef.current = shiftId
    changeRef.current = change
  })

  // A new shift while a write is waiting for one: send it.
  useEffect(() => {
    if (stashed === null || shiftId === null || shiftId === stashed.refusedUnder) return
    setStashed(null)
    void changeRef.current(stashed.id, stashed.patch).then((saved) => {
      if (saved) notify({ tone: 'ok', title: 'Saved', message: 'Sent after you clocked in.' })
    })
  }, [shiftId, stashed])

  // The dialog was dismissed and nobody clocked in: forget the write rather than send it at some later shift.
  useEffect(() => {
    if (stashed === null || promptOpen) return
    const timer = window.setTimeout(() => setStashed(null), DISMISS_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [stashed, promptOpen])

  const isPending = useCallback((id: string, field: PatchField): boolean => (inFlight[slot(id, field)] ?? 0) > 0, [inFlight])
  return { change, isPending }
}
