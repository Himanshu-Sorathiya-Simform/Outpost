import { useBridgeLog, useErrorCounts, useLabSetting, useNetLog, useNetStatus, useOpenTabs } from '@/lib'
import { useLabState } from '@/lib/queries'
import { usePwaStore } from '@/pwa'
import type { Tone } from '@/ui'
import { countChaos } from './ServerPlate'

export interface InstrumentTag {
  text: string
  tone: Tone
}

/** Live one-word readings for the index, keyed by instrument path. Only what the page already holds; nothing is fetched for them. */
export function useInstrumentTags(): Record<string, InstrumentTag[]> {
  const standalone = usePwaStore((s) => s.standalone)
  const swState = usePwaStore((s) => s.swState)
  const queued = usePwaStore((s) => s.queuedCount)
  const requests = useNetLog((s) => s.entries.length)
  const seamCalls = useBridgeLog((s) => s.entries.length)
  const tabs = useOpenTabs().length
  const counts = useErrorCounts()
  const staleSec = useLabSetting('staleTimeSec')
  const { server } = useNetStatus()
  const lab = useLabState().data

  const recorded = Object.values(counts).reduce((sum, n) => sum + n, 0)
  const chaos = lab ? countChaos(lab.chaos) : null

  return {
    '/lab/environment': [{ text: standalone ? 'installed window' : 'browser tab', tone: 'neutral' }],
    '/lab/worker': [{ text: `sw ${swState}`, tone: swState === 'none' ? 'neutral' : 'ok' }],
    '/lab/network': [{ text: `${requests} logged`, tone: server === 'unreachable' ? 'warn' : 'neutral' }],
    '/lab/chaos': chaos === null ? [] : [{ text: chaos === 0 ? 'all clear' : `${chaos} active`, tone: chaos === 0 ? 'ok' : 'warn' }],
    '/lab/server': lab ? [{ text: lab.wire.auto ? 'wire auto' : 'wire manual', tone: 'neutral' }] : [],
    '/lab/queue': [
      { text: `outbox ${queued}`, tone: queued > 0 ? 'warn' : 'neutral' },
      { text: `${tabs} ${tabs === 1 ? 'tab' : 'tabs'}`, tone: 'neutral' },
      { text: `${seamCalls} seam calls`, tone: 'neutral' },
    ],
    '/lab/errors': [{ text: `${recorded} recorded`, tone: recorded > 0 ? 'error' : 'neutral' }],
    '/lab/query': [{ text: `stale after ${staleSec} s`, tone: 'neutral' }],
  }
}
