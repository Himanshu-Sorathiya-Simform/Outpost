import { useState } from 'react'
import { useSwMessageLog, type SwMessageLogEntry } from '@/lib/bridge'
import { Button, Disclosure, EmptyState, JsonView, Plate, Segmented, Table, Tag, TBody, Td, Th, THead, Tr, formatClock } from '@/ui'
import stacked from './EnvStacked.module.css'
import styles from './WorkerMessages.module.css'

type Filter = 'all' | 'valid' | 'invalid' | 'log'

const PAGE = 25

const isLog = (e: SwMessageLogEntry): boolean => e.type === 'log'

const FILTERS: Record<Filter, (e: SwMessageLogEntry) => boolean> = {
  all: () => true,
  valid: (e) => e.valid,
  invalid: (e) => !e.valid,
  log: isLog,
}

/** A worker debug line: `{ type: 'log', level, message }`, printed as text instead of as a payload to dig through. */
function logLine(e: SwMessageLogEntry): string | null {
  if (!isLog(e) || typeof e.raw !== 'object' || e.raw === null) return null
  const { level, message } = e.raw as { level?: unknown; message?: unknown }
  return typeof message === 'string' ? `${typeof level === 'string' ? level : 'info'}: ${message}` : null
}

/** Every message the bridge saw cross the page and worker boundary, in both directions, valid or not. */
export function WorkerMessages() {
  const entries = useSwMessageLog((s) => s.entries)
  const clear = useSwMessageLog((s) => s.clear)
  const [filter, setFilter] = useState<Filter>('all')
  const [shown, setShown] = useState(PAGE)
  const matching = entries.filter(FILTERS[filter])
  const visible = matching.slice(0, shown)
  const invalid = entries.filter((e) => !e.valid).length

  return (
    <Plate
      index="Nº 0005"
      title="Message log"
      actions={
        <Button size="sm" icon="trash" onClick={clear} disabled={entries.length === 0}>
          Clear
        </Button>
      }
    >
      <div className={styles.body}>
        <div className={styles.tools}>
          <Segmented
            label="Filter messages"
            size="sm"
            value={filter}
            onChange={(f) => {
              setFilter(f)
              setShown(PAGE)
            }}
            options={[
              { value: 'all', label: `All ${entries.length}` },
              { value: 'valid', label: 'Valid' },
              { value: 'invalid', label: `Invalid ${invalid}` },
              { value: 'log', label: 'Log' },
            ]}
          />
          <p className={styles.count} role="status">
            {matching.length} shown, newest first, at most 100 kept. Invalid messages are kept with the reason the schema gave.
          </p>
        </div>
        {matching.length === 0 ? (
          <EmptyState compact icon="queue" title={entries.length === 0 ? 'No messages yet' : 'Nothing matches this filter'}>
            {entries.length === 0
              ? 'Nothing has crossed the boundary since the page loaded. A worker that calls postMessage on its clients, or one of the send buttons above, puts a line here.'
              : 'Change the filter to see the other messages.'}
          </EmptyState>
        ) : (
          <>
            <Table caption="Service worker messages" dense minWidth={0} className={stacked.stack}>
              <THead>
                <Tr>
                  <Th>Clock</Th>
                  <Th>Direction</Th>
                  <Th>Type</Th>
                  <Th>Schema</Th>
                  <Th>What the app did</Th>
                  <Th>Payload</Th>
                </Tr>
              </THead>
              <TBody>
                {visible.map((e) => (
                  <Tr key={e.id} flag={e.valid ? undefined : 'error'}>
                    <Td nowrap mono>
                      {formatClock(e.at, true)}
                    </Td>
                    <Td nowrap>
                      <span className={stacked.label}>Direction</span>
                      <Tag tone={e.direction === 'in' ? 'info' : 'accent'}>{e.direction === 'in' ? 'in' : 'out'}</Tag> <span className="muted">{e.channel}</span>
                    </Td>
                    <Td mono nowrap className={styles.type}>
                      {e.type ?? 'no type'}
                    </Td>
                    <Td>
                      <Tag tone={e.valid ? 'ok' : 'error'} icon={e.valid ? 'check' : 'x'}>
                        {e.valid ? 'valid' : 'invalid'}
                      </Tag>
                    </Td>
                    <Td mono className={styles.note}>
                      <span className={stacked.label}>What the app did</span>
                      {logLine(e) ?? e.note ?? <span className="muted">nothing to do</span>}
                      {e.reason ? <span className={styles.reason}>{e.reason}</span> : null}
                    </Td>
                    <Td className={styles.payload}>
                      <Disclosure summary="View" variant="rule">
                        <JsonView value={e.raw} title={e.type ?? 'payload'} expandDepth={2} maxHeight={220} />
                      </Disclosure>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            {matching.length > shown ? (
              <Button icon="arrow-down" onClick={() => setShown(shown + PAGE)}>
                Show {Math.min(PAGE, matching.length - shown)} older of {matching.length - shown}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </Plate>
  )
}
