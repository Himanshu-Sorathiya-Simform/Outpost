import { useCallback, useState } from 'react'
import { callSeam } from '@/lib/bridge/seam'
import type { AppError } from '@/lib/errors/app-error'
import { toAppError } from '@/lib/errors/normalize'

/**
 * Where a click on a PWA-backed control stands. `unwired` is the stub answering (an expected state while the learner has
 * not written that file yet); `denied` and `unsupported` are the browser's answer; `failed` is anything else.
 */
export type ActionPhase = 'idle' | 'running' | 'ok' | 'unwired' | 'denied' | 'unsupported' | 'failed'

export interface SeamActionState<T> {
  phase: ActionPhase
  value: T | undefined
  error: AppError | null
  /** Epoch ms of the last answer. */
  at: number | null
}

export interface SeamAction<A extends unknown[], T> {
  state: SeamActionState<T>
  /** Resolves with the value, or `undefined` when the call did not succeed (the reason is in `state`). */
  run(...args: A): Promise<T | undefined>
  reset(): void
}

const IDLE: SeamActionState<never> = { phase: 'idle', value: undefined, error: null, at: null }

const phaseFor = (error: AppError): ActionPhase =>
  error.kind === 'not-implemented' ? 'unwired' : error.kind === 'permission' ? 'denied' : error.kind === 'unsupported' ? 'unsupported' : 'failed'

/**
 * One user-triggered call into src/pwa through callSeam, with its outcome kept as state so the control next to it can
 * show what happened. `call` is the arrow that reaches into `pwa.*`, e.g. `(n) => pwa.badge.set(n)`.
 */
export function useSeamAction<A extends unknown[], T>(feature: string, call: (...args: A) => T | Promise<T>): SeamAction<A, T> {
  const [state, setState] = useState<SeamActionState<T>>(IDLE)

  const run = useCallback(
    async (...args: A): Promise<T | undefined> => {
      setState({ phase: 'running', value: undefined, error: null, at: null })
      try {
        const value = await callSeam(feature, () => call(...args))
        setState({ phase: 'ok', value, error: null, at: Date.now() })
        return value
      } catch (thrown) {
        const error = toAppError(thrown, { source: `seam:${feature}` })
        setState({ phase: phaseFor(error), value: undefined, error, at: Date.now() })
        return undefined
      }
    },
    [feature, call],
  )

  const reset = useCallback(() => setState(IDLE), [])
  return { state, run, reset }
}
