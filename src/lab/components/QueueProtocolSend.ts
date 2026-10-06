import { useCallback, useEffect, useRef, useState } from 'react'
import { SW_BROADCAST_CHANNEL } from '@shared/sw-protocol'
import { useBridgeLog, useSwMessageLog, useToastStore, type Toast } from '@/lib'

export type Route = 'auto' | 'service-worker' | 'broadcast'
export type Via = 'service-worker' | 'broadcast-channel'

/** How long to wait for the app to react before saying it did not. A BroadcastChannel delivers on a later task. */
const SETTLE_MS = 900
/** Toasts are caught for this long after a send; they expire from the store on their own. */
const CATCH_MS = 2000

export interface CaughtToast {
  id: string
  tone: Toast['tone']
  title: string
  message: string | null
  hasAction: boolean
}

export interface Run {
  /** Increases with every send; keys the reaction panel. */
  n: number
  via: Via
  sentAt: number
  /** Newest log ids at the moment of sending: anything above them was caused by, or happened during, this send. */
  baseline: { sw: number; bridge: number }
  toasts: CaughtToast[]
  settled: boolean
}

export interface SendFailure {
  problem: string
}

/**
 * Delivers `data` to the app's own bridge the way a service worker would: a `message` event on
 * navigator.serviceWorker, or a post on the 'outpost-sw' BroadcastChannel. Returns what it used, or why it could not.
 */
export function deliverAsWorker(data: unknown, route: Route): { via: Via } | SendFailure {
  const container = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined
  const canEvent = container !== undefined && typeof container.dispatchEvent === 'function'
  const canChannel = typeof BroadcastChannel === 'function'

  if (route === 'service-worker' || (route === 'auto' && canEvent)) {
    if (!container || !canEvent) return { problem: 'navigator.serviceWorker does not exist in this context, so there is nothing to dispatch on. Use the BroadcastChannel route.' }
    container.dispatchEvent(new MessageEvent('message', { data }))
    return { via: 'service-worker' }
  }
  if (!canChannel) return { problem: 'This browser has neither navigator.serviceWorker nor BroadcastChannel.' }
  const channel = new BroadcastChannel(SW_BROADCAST_CHANNEL)
  try {
    channel.postMessage(data)
  } finally {
    channel.close()
  }
  return { via: 'broadcast-channel' }
}

/** Sends test messages and remembers what the app did about the latest one, including the toasts it raised. */
export function useProtocolRun(): { run: Run | null; send: (data: unknown, route: Route) => SendFailure | null } {
  const [run, setRun] = useState<Run | null>(null)
  const counter = useRef(0)
  const cleanups = useRef<Array<() => void>>([])

  useEffect(() => {
    const pending = cleanups.current
    return () => pending.forEach((fn) => fn())
  }, [])

  const send = useCallback((data: unknown, route: Route): SendFailure | null => {
    cleanups.current.forEach((fn) => fn())
    cleanups.current = []

    const n = ++counter.current
    const baseline = { sw: useSwMessageLog.getState().entries[0]?.id ?? 0, bridge: useBridgeLog.getState().entries[0]?.id ?? 0 }
    const seen = new Set(useToastStore.getState().toasts.map((t) => t.id))
    const caught: CaughtToast[] = []
    const unsubscribe = useToastStore.subscribe((s) => {
      const fresh = s.toasts.filter((t) => !seen.has(t.id))
      if (fresh.length === 0) return
      fresh.forEach((t) => {
        seen.add(t.id)
        caught.push({ id: t.id, tone: t.tone, title: t.title, message: t.message, hasAction: t.action !== null })
      })
      setRun((r) => (r && r.n === n ? { ...r, toasts: [...caught] } : r))
    })

    const delivered = deliverAsWorker(data, route)
    if ('problem' in delivered) {
      unsubscribe()
      return delivered
    }

    setRun({ n, via: delivered.via, sentAt: Date.now(), baseline, toasts: [...caught], settled: false })
    const settle = setTimeout(() => setRun((r) => (r && r.n === n ? { ...r, settled: true } : r)), SETTLE_MS)
    const release = setTimeout(unsubscribe, CATCH_MS)
    cleanups.current = [unsubscribe, () => clearTimeout(settle), () => clearTimeout(release)]
    return null
  }, [])

  return { run, send }
}
