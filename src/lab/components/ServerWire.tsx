import { useState } from 'react'
import { Link } from 'react-router'
import { SEVERITIES, type LabState, type Severity } from '@shared/contracts'
import { useLabFeedStore } from '@/lib'
import { useSpawnWire, useUpdateWire } from '@/lib/queries'
import { Button, EmptyState, Field, Plate, Segmented, SeverityStamp, Select, Switch, TimeAgo } from '@/ui'
import { MutationNote } from './ServerMutationNote'
import styles from './ServerWire.module.css'

const INTERVALS = [2, 5, 10, 30, 60, 300]
const COUNTS = ['1', '3', '10'] as const
type Count = (typeof COUNTS)[number]
type SeverityChoice = Severity | 'template'

const intervalOptions = (current: number) =>
  (INTERVALS.includes(current) ? INTERVALS : [...INTERVALS, current].sort((a, b) => a - b)).map((n) => ({ value: String(n), label: n >= 60 && n % 60 === 0 ? `every ${n / 60} min` : `every ${n} s` }))

/** What the wire generator has done since this page opened, straight from the live feed. */
function WireActivity() {
  const events = useLabFeedStore((s) => s.wireEvents)
  const filed = events.flatMap(({ at, event }) => (event.type === 'wire' ? [{ at, ...event }] : []))
  const pushes = events.flatMap(({ at, event }) => (event.type === 'push' ? [{ at, ...event }] : []))
  const last = filed[0]
  const lastPush = pushes[0]

  return (
    <div className={styles.activity} aria-live="polite">
      <h3 className={styles.heading}>Last wire dispatch</h3>
      {last ? (
        <div className={styles.last}>
          <SeverityStamp severity={last.severity} size="sm" flat />
          <Link to={`/log/${last.dispatchId}`} className={styles.link}>
            {last.dispatchId}
          </Link>
          <span className={styles.title}>{last.title}</span>
          <span className="muted">
            <TimeAgo at={last.at} />
          </span>
        </div>
      ) : (
        <EmptyState compact icon="signal" title="Nothing on the wire yet">
          No dispatch has arrived since this page opened. Switch auto on, or file one by hand.
        </EmptyState>
      )}
      {filed.length > 1 ? <p className={styles.count}>{filed.length} filed since this page opened.</p> : null}
      {lastPush ? (
        <p className={styles.count}>
          Last push: {lastPush.delivered} of {lastPush.attempted} delivered, &ldquo;{lastPush.title}&rdquo;, <TimeAgo at={lastPush.at} />.
        </p>
      ) : null}
    </div>
  )
}

/** The wire generator: what files dispatches when nobody at the keyboard does. */
export function ServerWire({ wire }: { wire: LabState['wire'] }) {
  const update = useUpdateWire()
  const spawn = useSpawnWire()
  const [count, setCount] = useState<Count>('1')
  const [severity, setSeverity] = useState<SeverityChoice>('template')
  const filed = spawn.data?.data.spawned ?? []
  const busy = update.isPending
  // The controls stay enabled while a write is in flight: disabling the focused one would drop keyboard focus to <body>.
  const change = (patch: Parameters<typeof update.mutate>[0]): void => {
    if (!busy) update.mutate(patch)
  }

  return (
    <Plate index="Nº 0001" title="Wire simulator">
      <div className={styles.body}>
        <p className={styles.lede}>The relay files dispatches by itself from a pool of templates. Filing one does not refresh the log you already loaded, on purpose: that gap is the stale-cache exercise.</p>
        <div className={styles.cols}>
          <div className={styles.group}>
            <h3 className={styles.heading}>Automatic filing</h3>
            <Switch checked={wire.auto} aria-busy={busy || undefined} label="File dispatches automatically" description="One new dispatch each interval, until switched off." onChange={(auto) => change({ auto })} />
            <Field label="Interval">
              <Select
                value={String(wire.everySec)}
                options={intervalOptions(wire.everySec)}
                aria-busy={busy || undefined}
                onChange={(e) => change({ everySec: Number(e.target.value) })}
              />
            </Field>
            <Switch
              checked={wire.pushOnNew}
              aria-busy={busy || undefined}
              label="Push on each new dispatch"
              description="Sends a push to every subscription. Needs a subscription: see the push console."
              onChange={(pushOnNew) => change({ pushOnNew })}
            />
            <MutationNote status={update.status} error={update.error} success="Wire settings stored on the relay." />
          </div>
          <div className={styles.group}>
            <h3 className={styles.heading}>File some now</h3>
            <Segmented label="How many" value={count} onChange={setCount} options={COUNTS.map((c) => ({ value: c, label: c }))} size="sm" showLabel />
            <Field label="Severity">
              <Select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as SeverityChoice)}
                options={[{ value: 'template', label: "Whatever the template says" }, ...SEVERITIES.map((s) => ({ value: s, label: s }))]}
              />
            </Field>
            <div className={styles.run}>
              <Button icon="send" variant="primary" loading={spawn.isPending} onClick={() => spawn.mutate({ count: Number(count), severity: severity === 'template' ? undefined : severity })}>
                File {count} now
              </Button>
              <Link to="/log" className={styles.link}>
                Open the log
              </Link>
            </div>
            <MutationNote status={spawn.status} error={spawn.error} success={`${filed.length} filed.`} />
            {filed.length > 0 ? (
              <ul className={styles.filed} aria-label="Dispatches just filed">
                {filed.map((d) => (
                  <li key={d.id}>
                    <SeverityStamp severity={d.severity} size="sm" flat />
                    <Link to={`/log/${d.id}`} className={styles.link}>
                      {d.id}
                    </Link>
                    <span className={styles.title}>{d.title}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <WireActivity />
      </div>
    </Plate>
  )
}
