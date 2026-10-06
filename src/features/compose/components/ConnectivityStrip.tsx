import { useLabSetting, useNetStatus, type NetStatus } from '@/lib'
import { StatusDot, type StatusTone } from '@/ui'
import styles from './ConnectivityStrip.module.css'

export type StripContext = 'compose' | 'drafts'

interface Reading {
  tone: StatusTone
  head: string
  detail: string
}

function read(context: StripContext, net: NetStatus, timeoutSec: number): Reading {
  const filing = context === 'compose' ? 'Filing' : 'Send now'
  if (!net.browserOnline) {
    return { tone: 'warn', head: 'Device offline', detail: `${filing} will fail at once and the dispatch stays on this device.` }
  }
  if (net.lieFi) {
    return {
      tone: 'warn',
      head: 'Relay not answering',
      detail: `${filing} will try the relay and wait up to ${timeoutSec} s before keeping the dispatch on this device.`,
    }
  }
  if (net.server === 'reachable') {
    return {
      tone: 'ok',
      head: net.lastLatencyMs === null ? 'Relay answering' : `Relay answering, ${net.lastLatencyMs} ms`,
      detail: `${filing} will go to the relay now.`,
    }
  }
  if (net.server === 'unreachable') {
    return { tone: 'error', head: 'Relay down', detail: `${filing} will try once more, then keep the dispatch on this device.` }
  }
  return { tone: 'idle', head: 'Relay not checked yet', detail: `${filing} will try the relay.` }
}

/** Says, before the button is pressed, whether pressing it will reach the relay. */
export function ConnectivityStrip({ context }: { context: StripContext }) {
  const net = useNetStatus()
  const timeoutMs = useLabSetting('requestTimeoutMs')
  const { tone, head, detail } = read(context, net, Math.round(timeoutMs / 1000))
  return (
    <p className={styles.strip} role="status" aria-live="polite">
      <StatusDot tone={tone} label={head} />
      <span className={styles.detail}>{detail}</span>
    </p>
  )
}
