import type { ReactNode } from 'react'
import { useLabSetting } from '@/lib'
import { refreshWorkerSnapshot, useWorkerSnapshot, type Probe, type RegistrationSnapshot, type WorkerSlot } from '../observers/worker-observer'
import { Button, EmptyState, ErrorState, KeyValue, Plate, Skeleton, StatusDot, Tag, TimeAgo, type Tone } from '@/ui'
import styles from './WorkerRegistrations.module.css'

const STATE_TONE: Record<ServiceWorkerState, Tone> = { parsed: 'neutral', installing: 'info', installed: 'warn', activating: 'info', activated: 'ok', redundant: 'error' }

function Slot({ name, slot }: { name: string; slot: WorkerSlot | null }) {
  return (
    <li className={styles.slot}>
      <span className={styles.slotName}>{name}</span>
      {slot ? <Tag tone={STATE_TONE[slot.state]}>{slot.state}</Tag> : <span className={styles.empty}>empty</span>}
      {slot ? <span className={styles.script}>{new URL(slot.scriptURL).pathname}</span> : <span />}
    </li>
  )
}

function probeValue<T>(probe: Probe<T>, show: (value: T) => ReactNode): ReactNode {
  if (probe.status === 'ok') return show(probe.value)
  if (probe.status === 'unsupported') return <span title={probe.reason}>not in this browser</span>
  return <Tag tone="warn" title={probe.message}>read failed</Tag>
}

const tags = (list: string[]): string => (list.length === 0 ? 'none registered' : list.join(', '))

function Card({ reg }: { reg: RegistrationSnapshot }) {
  return (
    <article className={styles.card} aria-label={`Registration for ${reg.scope}`}>
      <p className={styles.scope}>{reg.scope}</p>
      <div className={styles.tags}>
        <Tag tone={reg.controlsPage ? 'ok' : 'neutral'} icon={reg.controlsPage ? 'check' : undefined}>
          {reg.controlsPage ? 'Controls this page' : 'Not controlling this page'}
        </Tag>
        <Tag>updateViaCache: {reg.updateViaCache}</Tag>
      </div>
      <ul className={styles.slots} aria-label="Worker slots">
        <Slot name="installing" slot={reg.installing} />
        <Slot name="waiting" slot={reg.waiting} />
        <Slot name="active" slot={reg.active} />
      </ul>
      <KeyValue
        dense
        items={[
          { label: 'Navigation preload', value: probeValue(reg.navigationPreload, (v) => (v.enabled ? `on, header "${v.headerValue}"` : 'off')) },
          { label: 'Push subscription', value: probeValue(reg.push, (v) => (v ? `yes, ...${v.endpointTail}` : 'none')) },
          { label: 'Sync tags', value: probeValue(reg.syncTags, tags) },
          { label: 'Periodic tags', value: probeValue(reg.periodicTags, tags) },
        ]}
      />
    </article>
  )
}

/** Every registration the browser lists for this origin, read on each lifecycle event. */
export function WorkerRegistrations() {
  const snap = useWorkerSnapshot()
  const showAge = useLabSetting('showProvenance')
  const refresh = (): void => void refreshWorkerSnapshot()

  return (
    <Plate
      index="Nº 0001"
      title="Registrations"
      aria-busy={snap.phase === 'loading'}
      actions={
        <>
          {showAge && snap.readAt ? (
            <span className="label" title="When the browser was last asked">
              Read <TimeAgo at={snap.readAt} />
            </span>
          ) : null}
          <Button size="sm" icon="refresh" onClick={refresh}>
            Refresh
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        {snap.phase === 'loading' ? (
          <div role="status" aria-label="Reading registrations">
            <Skeleton variant="block" height={96} />
          </div>
        ) : null}
        {snap.phase === 'unsupported' ? (
          <EmptyState icon="worker" title="No service worker API here">
            {snap.unsupportedReason}
          </EmptyState>
        ) : null}
        {snap.error ? <ErrorState error={snap.error} onRetry={refresh} compact={snap.phase === 'ready'} /> : null}
        {snap.phase === 'ready' || (snap.phase === 'error' && snap.registrations.length > 0) ? (
          <>
            <div className={styles.facts}>
              <span>
                <StatusDot tone={snap.controller ? 'ok' : 'idle'} label={snap.controller ? `Controlled by ${new URL(snap.controller.scriptURL).pathname}` : 'Page has no controller'} />
              </span>
              <span>
                <StatusDot tone={snap.ready === 'resolved' ? 'ok' : 'idle'} label={snap.ready === 'resolved' ? 'serviceWorker.ready resolved' : 'serviceWorker.ready pending'} />
              </span>
            </div>
            {snap.registrations.length === 0 ? (
              <EmptyState compact icon="worker" title="Nothing registered for this origin">
                getRegistrations() returned an empty list. <code>ready</code> stays pending until a registration has an active worker, so code that awaits it on an unregistered site waits forever.
              </EmptyState>
            ) : (
              <div className={styles.cards}>
                {snap.registrations.map((reg) => (
                  <Card key={reg.scope} reg={reg} />
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </Plate>
  )
}
