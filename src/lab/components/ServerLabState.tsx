import { useState } from 'react'
import type { LabState } from '@shared/contracts'
import { useResetLab } from '@/lib/queries'
import { Button, Dialog, KeyValue, Plate, Stat, StatGroup, TimeAgo, formatStamp } from '@/ui'
import { MutationNote } from './ServerMutationNote'
import styles from './ServerLabState.module.css'

/** Counters since the relay started, which instance answers, and the way back to a clean slate. */
export function ServerLabState({ state }: { state: LabState }) {
  const reset = useResetLab()
  const [confirming, setConfirming] = useState(false)
  const { counters } = state

  return (
    <Plate index="Nº 0006" title="Relay state">
      <div className={styles.body}>
        <StatGroup>
          <Stat label="Requests" value={counters.requests} note="not counting /api/_lab" />
          <Stat label="Chaos hits" value={counters.chaosInjected} tone={counters.chaosInjected > 0 ? 'warn' : 'default'} />
          <Stat label="Dispatches" value={counters.dispatches} />
          <Stat label="Pushes sent" value={counters.pushSent} />
          <Stat label="Subscriptions" value={counters.subscriptions} />
          <Stat label="Sessions" value={counters.sessions} />
        </StatGroup>

        <KeyValue
          dense
          columns={2}
          items={[
            { label: 'Instance', value: state.serverInstance, mono: true },
            { label: 'Started', value: formatStamp(state.startedAt), mono: true },
            { label: 'Up for', value: <TimeAgo at={state.startedAt} suffix="" /> },
            { label: 'Session lifetime', value: `${state.sessionTtlSec} s`, mono: true },
          ]}
        />

        <div className={styles.reset}>
          <div className={styles.copy}>
            <p>
              Reset re-seeds the dispatches and puts chaos, wire, release and headers back to their defaults. Push subscriptions and the VAPID key stay. Seeded dispatches come back with the same ids at revision 1, so a copy
              this browser cached before the reset can look current and be wrong.
            </p>
            <MutationNote status={reset.status} error={reset.error} success="Reset done. Every cached query was invalidated." pending="Re-seeding the relay" />
          </div>
          <Button variant="danger" icon="trash" loading={reset.isPending} onClick={() => setConfirming(true)}>
            Reset the lab
          </Button>
        </div>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        title="Reset the whole lab?"
        description="Dispatches, chaos rules, the wire, the release numbers and the header profile go back to their defaults."
        footer={
          <>
            <Button data-autofocus onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                reset.mutate()
                setConfirming(false)
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        <p className={styles.copy}>Anything you filed from the compose screen is lost. Subscriptions stay.</p>
      </Dialog>
    </Plate>
  )
}
