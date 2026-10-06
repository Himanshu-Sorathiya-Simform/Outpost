import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Dispatch, DispatchCreate } from '@shared/contracts'
import { callSeam } from '@/lib/bridge'
import type { AppError } from '@/lib/errors/app-error'
import { toAppError } from '@/lib/errors/normalize'
import { notify } from '@/lib/notify'
import { sessionPrompt, useCreateDispatch, useSession, useSessionPrompt, useStations } from '@/lib/queries'
import { pwa } from '@/pwa'
import { dispatchIndex } from '../../dispatches/format'
import type { DraftOrigin } from '../drafts/draft-schema'
import { draftActions } from '../drafts/draft-store'
import type { FormValues } from '../form/form-values'
import { buildDispatch, issuesFromDetails, issuesToErrors, type FieldErrors, type FieldKey } from '../form/validate'

/** Kinds that mean the dispatch never reached the relay, or may not have: the outbox's job. */
const OFFLINE_PATH: ReadonlySet<string> = new Set(['network', 'offline', 'timeout', 'unavailable', 'server'])
const SHIFT_REASON = 'Filing a dispatch needs an active shift. Clock in and it will be sent straight away; nothing typed is lost.'
/** How long to wait, when the relay gives no Retry-After, before allowing another press. */
const DEFAULT_RETRY_AFTER_SEC = 10
/** Clock-in closes its dialog a beat before the session query reports the new shift. */
const DISMISS_GRACE_MS = 500

export interface SubmitJob {
  /**
   * The local draft holding this entry: the record of what was tried. Null only for an entry so empty that it cannot
   * pass validation, which never gets as far as a network call.
   */
  draftId: string | null
  /** Idempotency key, fixed per draft. */
  clientId: string
  values: FormValues
}

interface ActiveJob extends SubmitJob {
  /** When the operator first pressed the button; kept across a clock-in detour. */
  pressedAt: string
}

export type SubmitState =
  | { status: 'idle' }
  | { status: 'sending'; draftId: string | null }
  | { status: 'invalid'; draftId: string | null; errors: FieldErrors; attempt: number }
  | { status: 'awaiting-session'; draftId: string | null }
  | { status: 'no-session'; draftId: string | null }
  | { status: 'rejected'; draftId: string | null; errors: FieldErrors; error: AppError; attempt: number }
  | { status: 'rate-limited'; draftId: string | null; error: AppError; until: number }
  | { status: 'failed'; draftId: string | null; error: AppError }
  /** Not sent, and the outbox seam is a stub: the dispatch stays a local draft. */
  | { status: 'kept-locally'; draftId: string | null; error: AppError }
  | { status: 'queue-failed'; draftId: string | null; error: AppError; cause: AppError }

export interface SubmitOptions {
  /** Called once the relay has the dispatch (created or replayed), just before leaving the page. */
  onFiled?: (dispatch: Dispatch) => void
}

export interface SubmitApi {
  state: SubmitState
  /** A request is in flight. */
  pending: boolean
  submit: (job: SubmitJob) => void
  /** Drop the message for one field once the operator edits it. */
  clearFieldError: (field: FieldKey) => void
  /** Back to idle (rate-limit countdown elapsed, or the page wants a clean slate). */
  reset: () => void
}

function markDraft(job: SubmitJob, patch: { origin?: DraftOrigin; lastError?: string | null }): void {
  if (job.draftId) draftActions.mark(job.draftId, patch)
}

/** Zero-padded register number from a dispatch id: dp-000123 -> "Nº 000123". */
export const referenceOf = dispatchIndex

/**
 * The filing flow, shared by the compose page and the drafts list:
 * validate -> shift check -> POST under the draft's idempotency key -> on a dead link, hand the
 * dispatch to the outbox seam -> on a stub, keep it as a local draft. Input is never discarded.
 */
export function useSubmitDispatch({ onFiled }: SubmitOptions = {}): SubmitApi {
  const navigate = useNavigate()
  const create = useCreateDispatch()
  const stations = useStations().data?.items
  const sessionData = useSession().data
  const session = sessionData?.session ?? null
  /** Known to be signed out; while the first answer is pending we just try and let a 401 decide. */
  const signedOut = sessionData !== undefined && session === null
  const promptOpen = useSessionPrompt((s) => s.open)
  const [state, setState] = useState<SubmitState>({ status: 'idle' })
  const inFlight = useRef(false)
  const waiting = useRef<ActiveJob | null>(null)
  /** Counts rejected attempts, so the page can tell a fresh rejection from an edit to the same message. */
  const attempts = useRef(0)

  const fail = useCallback((job: ActiveJob, error: AppError, message: string = error.userMessage): void => {
    markDraft(job, { lastError: message })
    setState({ status: 'failed', draftId: job.draftId, error })
  }, [])

  const toOutbox = useCallback(
    async (job: ActiveJob, error: AppError, input: DispatchCreate): Promise<void> => {
      markDraft(job, { origin: 'offline-failed', lastError: error.userMessage })
      try {
        await callSeam('sync.queueDispatch', () => pwa.sync.queueDispatch(input))
      } catch (thrown) {
        const cause = toAppError(thrown, { source: 'seam:sync.queueDispatch' })
        setState(
          cause.kind === 'not-implemented'
            ? { status: 'kept-locally', draftId: job.draftId, error }
            : { status: 'queue-failed', draftId: job.draftId, error, cause },
        )
        return
      }
      markDraft(job, { origin: 'queued', lastError: null })
      notify({ tone: 'ok', title: 'Queued', message: 'It will be sent when there is a signal.' })
      setState({ status: 'idle' })
      void navigate('/drafts')
    },
    [navigate],
  )

  const run = useCallback(
    async (job: ActiveJob): Promise<void> => {
      if (inFlight.current) return
      const built = buildDispatch(job.values, { clientId: job.clientId, filedAtClient: job.pressedAt, stations })
      if (!built.ok) {
        setState({ status: 'invalid', draftId: job.draftId, errors: built.errors, attempt: ++attempts.current })
        return
      }
      if (signedOut) {
        waiting.current = job
        sessionPrompt.open(SHIFT_REASON)
        setState({ status: 'awaiting-session', draftId: job.draftId })
        return
      }
      inFlight.current = true
      setState({ status: 'sending', draftId: job.draftId })
      try {
        const result = await create.mutateAsync(built.input)
        const replay = result.meta.status === 200
        notify({
          tone: 'ok',
          title: replay ? 'Already filed — this was a retry' : 'Dispatch filed',
          message: replay ? `The relay already had it as ${referenceOf(result.data.id)}. Nothing was duplicated.` : `Reference ${referenceOf(result.data.id)}.`,
        })
        onFiled?.(result.data)
        if (job.draftId) draftActions.remove(job.draftId)
        setState({ status: 'idle' })
        void navigate(`/log/${result.data.id}`)
      } catch (thrown) {
        const error = toAppError(thrown, { source: 'submit-dispatch' })
        if (error.kind === 'validation') {
          const errors = issuesToErrors(issuesFromDetails(error.context.details))
          markDraft(job, { lastError: error.userMessage })
          setState({ status: 'rejected', draftId: job.draftId, errors, error, attempt: ++attempts.current })
        } else if (error.kind === 'unauthorized') {
          waiting.current = job
          if (!useSessionPrompt.getState().open) sessionPrompt.open(SHIFT_REASON)
          setState({ status: 'awaiting-session', draftId: job.draftId })
        } else if (error.kind === 'rate-limited') {
          markDraft(job, { lastError: error.userMessage })
          setState({ status: 'rate-limited', draftId: job.draftId, error, until: Date.now() + (error.context.retryAfterSec ?? DEFAULT_RETRY_AFTER_SEC) * 1000 })
        } else if (OFFLINE_PATH.has(error.kind)) {
          await toOutbox(job, error, built.input)
        } else {
          fail(job, error)
        }
      } finally {
        inFlight.current = false
      }
    },
    [create, stations, signedOut, navigate, onFiled, fail, toOutbox],
  )

  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  })

  const submit = useCallback(
    (job: SubmitJob): void => {
      if (inFlight.current) return
      void run({ ...job, pressedAt: new Date().toISOString() })
    },
    [run],
  )

  // A new shift while a filing is waiting for one: send it, with the original press time.
  const shiftId = session?.issuedAt ?? null
  useEffect(() => {
    const job = waiting.current
    if (shiftId === null || job === null || inFlight.current) return
    waiting.current = null
    void runRef.current(job)
  }, [shiftId])

  // The clock-in dialog was dismissed and nobody clocked in.
  const awaiting = state.status === 'awaiting-session'
  const awaitingDraft = state.status === 'awaiting-session' ? state.draftId : null
  useEffect(() => {
    if (!awaiting || promptOpen) return
    const timer = window.setTimeout(() => {
      if (waiting.current === null) return
      waiting.current = null
      setState({ status: 'no-session', draftId: awaitingDraft })
    }, DISMISS_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [awaiting, awaitingDraft, promptOpen])

  const clearFieldError = useCallback((field: FieldKey): void => {
    setState((prev) => {
      if ((prev.status !== 'invalid' && prev.status !== 'rejected') || prev.errors[field] === undefined) return prev
      const { [field]: _removed, ...rest } = prev.errors
      return { ...prev, errors: rest }
    })
  }, [])

  const reset = useCallback((): void => setState({ status: 'idle' }), [])

  return { state, pending: state.status === 'sending', submit, clearFieldError, reset }
}
