import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageToSw } from '@shared/sw-protocol'
import { callSeam, sendToSw, useSwMessageLog } from '@/lib/bridge'
import { AppError } from '@/lib/errors/app-error'
import { refreshWorkerSnapshot } from '../observers/worker-observer'

export type ActionId = 'check-update' | 'apply-update' | 'unregister' | 'get-version' | 'ping' | 'clear-caches' | 'skip-waiting'

export interface Outcome {
  tone: 'ok' | 'warn' | 'error' | 'neutral'
  text: string
  at: number
}

/** How long a sent message waits for any reply before the outcome says there was none. */
export const REPLY_WAIT_MS = 3000

export interface WorkerActions {
  outcomes: Partial<Record<ActionId, Outcome>>
  busy: ActionId | null
  /** Runs a src/pwa method through callSeam and records what came back, including "still a stub". */
  runSeam<T>(id: ActionId, feature: string, fn: () => T | Promise<T>, describe: (value: T) => string): Promise<void>
  /** Posts to the page's controller and records whether a worker was there to hear it and whether it answered. */
  send(id: ActionId, message: PageToSw): void
}

export function useWorkerActions(): WorkerActions {
  const [outcomes, setOutcomes] = useState<Partial<Record<ActionId, Outcome>>>({})
  const [busy, setBusy] = useState<ActionId | null>(null)
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const pending = timers.current
    return () => {
      alive.current = false
      pending.forEach(clearTimeout)
    }
  }, [])

  const record = useCallback((id: ActionId, tone: Outcome['tone'], text: string): void => {
    if (alive.current) setOutcomes((o) => ({ ...o, [id]: { tone, text, at: Date.now() } }))
  }, [])

  const runSeam = useCallback<WorkerActions['runSeam']>(
    async (id, feature, fn, describe) => {
      setBusy(id)
      try {
        const value = await callSeam(feature, fn)
        record(id, 'ok', describe(value))
      } catch (err) {
        if (AppError.is(err) && err.kind === 'not-implemented') record(id, 'neutral', `Not wired up yet. ${feature} is still a stub in src/pwa, so nothing happened.`)
        else record(id, 'error', AppError.is(err) ? `${err.kind}: ${err.message}` : String(err))
      } finally {
        if (alive.current) setBusy(null)
        void refreshWorkerSnapshot()
      }
    },
    [record],
  )

  const send = useCallback<WorkerActions['send']>(
    (id, message) => {
      const before = useSwMessageLog.getState().entries[0]?.id ?? 0
      const hadController = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null
      if (!sendToSw(message)) {
        record(id, 'warn', hadController ? 'Not sent: postMessage threw. See the message log.' : 'Not sent: the page has no controller. A first visit and a hard reload both load without one, and so does a site with no worker.')
        return
      }
      record(id, 'neutral', `Sent ${message.type} to the controller. Waiting up to ${REPLY_WAIT_MS / 1000} s for a reply.`)
      timers.current.push(
        setTimeout(() => {
          const replies = useSwMessageLog.getState().entries.filter((e) => e.id > before && e.direction === 'in')
          if (replies.length === 0) record(id, 'warn', 'The controller received it and sent nothing back. Your worker may not handle this message type yet.')
          else record(id, 'ok', `Reply: ${replies.map((e) => e.type ?? 'unparseable').reverse().join(', ')}.`)
        }, REPLY_WAIT_MS),
      )
    },
    [record],
  )

  return { outcomes, busy, runSeam, send }
}
