import { Link } from 'react-router'
import { useNetStatus, useVersionStatus } from '@/lib'
import { sessionPrompt, useSession } from '@/lib/queries'
import { usePwaStore } from '@/pwa'
import { StatusDot } from '@/ui'
import { useSwControlled } from './browser-state'
import styles from './TelemetryStrip.module.css'

type Relay = 'reachable' | 'lie-fi' | 'none' | 'unknown'

function relayOf(server: 'unknown' | 'reachable' | 'unreachable', lieFi: boolean): Relay {
  if (lieFi) return 'lie-fi'
  if (server === 'reachable') return 'reachable'
  if (server === 'unreachable') return 'none'
  return 'unknown'
}

const OFF_SHIFT_REASON = 'Filing and acknowledging dispatches need an active shift. Clock in to set your callsign.'

/**
 * The 28px ticker above everything. The visible strip is not a live region (the relay latency changes every probe);
 * a separate hidden status line announces only discrete state changes.
 */
export function TelemetryStrip() {
  const { browserOnline, server, lieFi, lastLatencyMs } = useNetStatus()
  const swState = usePwaStore((s) => s.swState)
  const queued = usePwaStore((s) => s.queuedCount)
  const controlled = useSwControlled()
  const { running, skew, newDeploy } = useVersionStatus()
  const session = useSession()
  const callsign = session.data?.session?.operator.callsign ?? null

  const relay = relayOf(server, lieFi)
  const swNone = swState.toLowerCase() === 'none'
  const behind = skew === 'update-available' || skew === 'update-required' || newDeploy

  const spoken = [
    browserOnline ? null : 'Network down.',
    relay === 'lie-fi' ? 'Connected, but the relay does not answer.' : relay === 'none' && browserOnline ? 'Relay unreachable.' : null,
    swNone ? null : `Service worker ${swState}${controlled ? '' : ', not controlling this page'}.`,
  ].filter(Boolean)

  return (
    <div className={styles.strip} role="group" aria-label="Station telemetry">
      <span className={styles.item}>
        {browserOnline ? <StatusDot tone="ok" live size="sm" label="Net up" /> : <span className={styles.alarm}>Net down</span>}
      </span>
      <span className={styles.item}>
        {relay === 'reachable' ? (
          <span>Relay {lastLatencyMs === null ? 'ok' : `${lastLatencyMs} ms`}</span>
        ) : relay === 'lie-fi' ? (
          <span className={styles.lie} title="The browser says online, but the relay does not answer">
            Lie-fi
          </span>
        ) : relay === 'none' ? (
          <span className={styles.alarm}>No relay</span>
        ) : (
          <span className={styles.dim}>Relay --</span>
        )}
      </span>
      <span className={styles.item}>
        <span>SW {swState}</span>
        {!swNone && !controlled ? (
          <span className={styles.uncontrolled} title="A worker exists, but this page is not controlled by it. Reload once it has activated.">
            <i aria-hidden="true" />
            <span className={styles.wide}>Uncontrolled</span>
          </span>
        ) : null}
      </span>
      <span className={`${styles.item} ${styles.version}`}>
        <span>
          v{running.version} / b{running.buildId}
        </span>
        {behind ? <StatusDot tone="warn" size="sm" title="A newer version is available" /> : null}
      </span>
      <span className={styles.end}>
        {callsign ? (
          <Link to="/settings" className={styles.link}>
            <span className={styles.prefix}>Callsign</span>
            {callsign}
          </Link>
        ) : (
          <button type="button" className={styles.link} onClick={() => sessionPrompt.open(OFF_SHIFT_REASON)}>
            Off shift
          </button>
        )}
      </span>
      <Link to="/drafts" className={`${styles.link} ${queued > 0 ? styles.pending : ''}`}>
        Queue {queued}
      </Link>
      <p className="sr-only" role="status" aria-live="polite">
        {spoken.length > 0 ? spoken.join(' ') : 'Connection normal.'}
      </p>
    </div>
  )
}
