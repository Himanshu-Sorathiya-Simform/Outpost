import { useState } from 'react'
import { clearWorkerTimeline, timelineToJson, TIMELINE_CAP, useWorkerTimeline, type TimelineEvent, type TimelineKind } from '../observers/worker-observer'
import { Button, CopyButton, EmptyState, Plate, Table, Tag, TBody, Td, Th, THead, Tr, formatClock, formatDuration, type Tone } from '@/ui'
import stacked from './EnvStacked.module.css'
import styles from './WorkerTimeline.module.css'

const PAGE = 50

const KIND: Record<TimelineKind, { label: string; tone: Tone }> = {
  'observer-started': { label: 'observer', tone: 'neutral' },
  'registration-added': { label: 'registered', tone: 'ok' },
  'registration-removed': { label: 'unregistered', tone: 'error' },
  updatefound: { label: 'updatefound', tone: 'info' },
  statechange: { label: 'statechange', tone: 'accent' },
  controllerchange: { label: 'controllerchange', tone: 'warn' },
  ready: { label: 'ready', tone: 'ok' },
  message: { label: 'message', tone: 'neutral' },
  messageerror: { label: 'messageerror', tone: 'error' },
}

function download(events: readonly TimelineEvent[]): void {
  const url = URL.createObjectURL(new Blob([timelineToJson(events)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'outpost-worker-timeline.json'
  link.click()
  URL.revokeObjectURL(url)
}

/** Lifecycle events in the order the browser raised them, with the gap since the previous one. */
export function WorkerTimeline() {
  const events = useWorkerTimeline()
  const [shown, setShown] = useState(PAGE)
  const visible = events.slice(0, shown)

  return (
    <Plate
      index="Nº 0003"
      title="Lifecycle timeline"
      actions={
        <span className={styles.actions}>
          <CopyButton value={() => timelineToJson(events)} label="Copy JSON" />
          <Button size="sm" icon="download" onClick={() => download(events)} disabled={events.length === 0}>
            Download JSON
          </Button>
          <Button size="sm" icon="trash" onClick={clearWorkerTimeline} disabled={events.length === 0}>
            Clear
          </Button>
        </span>
      }
    >
      <div className={styles.body}>
        <p className={styles.count} role="status">
          {events.length} of at most {TIMELINE_CAP} events, newest first. Kept across route changes, lost on reload.
        </p>
        {events.length === 0 ? (
          <EmptyState compact icon="hourglass" title="Nothing has happened yet">
            The observer starts with the page. Register a worker, update it or unregister it and each step lands here.
          </EmptyState>
        ) : (
          <>
            <Table caption="Service worker lifecycle events" dense minWidth={0} className={stacked.stack}>
              <THead>
                <Tr>
                  <Th>Clock</Th>
                  <Th>Since previous</Th>
                  <Th>Event</Th>
                  <Th>What happened</Th>
                </Tr>
              </THead>
              <TBody>
                {visible.map((e, i) => {
                  const older = events[i + 1]
                  const kind = KIND[e.kind]
                  return (
                    <Tr key={e.id}>
                      <Td nowrap mono className={styles.time}>
                        {formatClock(e.at, true)}
                      </Td>
                      <Td nowrap mono className={styles.delta}>
                        <span className={stacked.label}>Since previous</span>
                        {older ? `+${formatDuration(e.at - older.at)}` : 'first'}
                      </Td>
                      <Td>
                        <Tag tone={kind.tone}>{e.state ? `${kind.label}: ${e.state}` : kind.label}</Tag>
                      </Td>
                      <Td className={styles.detail}>
                        {e.detail}
                        {e.scope ? <span className={styles.scope}>{e.scope}</span> : null}
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
            {events.length > shown ? (
              <Button icon="arrow-down" onClick={() => setShown(shown + PAGE)}>
                Show {Math.min(PAGE, events.length - shown)} older of {events.length - shown}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </Plate>
  )
}
