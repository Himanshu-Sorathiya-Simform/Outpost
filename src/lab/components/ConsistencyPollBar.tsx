import { Button, Switch, formatClock } from '@/ui'
import { PROBE_INTERVAL_MS } from './useConsistencyProbe'
import styles from './ConsistencyPollBar.module.css'

interface Props {
  paused: boolean
  onPausedChange: (paused: boolean) => void
  /** Epoch ms of the latest completed read of any polled layer, or null before the first. */
  checkedAt: number | null
  onCheckNow: () => void
}

/** Poll switch, last-checked clock and a manual check. Polling covers the server truth and Cache Storage; React is read live. */
export function ConsistencyPollBar({ paused, onPausedChange, checkedAt, onCheckNow }: Props) {
  return (
    <div className={styles.bar}>
      <Switch
        checked={!paused}
        onChange={(on) => onPausedChange(!on)}
        label={`Poll every ${PROBE_INTERVAL_MS / 1000} s`}
        description={paused ? 'Paused. The server and Cache Storage columns are frozen; React still updates as its cache changes.' : 'Server truth and Cache Storage. React is read live from its cache.'}
      />
      <p className={styles.clock}>
        <span className={styles.label}>Last checked</span>
        <span className={styles.time}>{checkedAt === null ? '--:--:--' : formatClock(checkedAt)}</span>
      </p>
      <Button size="sm" icon="refresh" onClick={onCheckNow}>
        Check now
      </Button>
    </div>
  )
}
