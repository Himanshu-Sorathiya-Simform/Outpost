import { Stat, StatGroup } from '@/ui'
import type { NetSummary } from './NetworkStats'

const pct = (ratio: number): string => `${Math.round(ratio * 100)}%`

/** The figure and its unit apart, so the big numeral stays on one line. */
function latency(ms: number | null): { value: string | number; unit?: string } {
  if (ms === null) return { value: '-' }
  return ms >= 1000 ? { value: (ms / 1000).toFixed(1), unit: 's' } : { value: Math.round(ms), unit: 'ms' }
}

/** One ruled strip of figures over the whole joined log, whatever the filters say. */
export function NetworkSummary({ summary }: { summary: NetSummary }) {
  const { counts } = summary
  return (
    <StatGroup>
      <Stat label="Network" value={counts.network} note="client and server agree" />
      <Stat
        label="Cache"
        value={counts.cache}
        tone={counts.cache > 0 ? 'accent' : 'default'}
        trend={summary.cacheTrend.length > 1 ? summary.cacheTrend : undefined}
        note={summary.cacheRatio === null ? 'no judged requests yet' : `${pct(summary.cacheRatio)} of ${summary.judged} judged`}
      />
      <Stat label="Server only" value={counts['server-only']} note="not made by this tab's apiFetch, page resources apart" />
      <Stat label="Page resources" value={summary.pageResources} note="scripts, fonts, images, documents" />
      <Stat label="Chaos" value={counts.chaos} tone={counts.chaos > 0 ? 'warn' : 'default'} note="a rule touched it" />
      <Stat label="Failed before server" value={counts['pre-server']} tone={counts['pre-server'] > 0 ? 'error' : 'default'} note="no response, no server record" />
      <Stat label="Client errors" value={summary.errors} tone={summary.errors > 0 ? 'error' : 'default'} note={`of ${summary.clientTotal} client requests`} />
      <Stat label="Median" {...latency(summary.p50)} note="client latency, p50" />
      <Stat label="Slow tail" {...latency(summary.p95)} note="client latency, p95" />
    </StatGroup>
  )
}
