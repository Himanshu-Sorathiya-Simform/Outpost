import { useState } from 'react'
import { useBridgeLog, type SeamOutcome } from '@/lib'
import { Button, EmptyState, Field, Plate, Segmented, Select, Table, TBody, Td, Th, THead, Tr, formatClock, formatDuration } from '@/ui'
import { AREAS, areaOf } from './QueueSeamMethods'
import { OutcomeStamp } from './QueueStamp'
import stacked from './ServerStacked.module.css'
import styles from './QueueCallLog.module.css'

type OutcomeFilter = SeamOutcome | 'all'

const PAGE = 30

/** Every call into src/pwa, newest first, with the time it took and what went wrong. */
export function QueueCallLog() {
  const entries = useBridgeLog((s) => s.entries)
  const clear = useBridgeLog((s) => s.clear)
  const [area, setArea] = useState('all')
  const [outcome, setOutcome] = useState<OutcomeFilter>('all')
  const [shown, setShown] = useState(PAGE)

  const matching = entries.filter((e) => (area === 'all' || areaOf(e.feature) === area) && (outcome === 'all' || e.outcome === outcome))
  const visible = matching.slice(0, shown)
  const count = (o: SeamOutcome): number => entries.filter((e) => e.outcome === o).length

  return (
    <Plate
      index="Nº 0002"
      title="Seam call log"
      actions={
        <Button size="sm" icon="trash" onClick={clear} disabled={entries.length === 0}>
          Clear
        </Button>
      }
    >
      <div className={styles.body}>
        <div className={styles.tools}>
          <Field label="Feature" className={styles.area}>
            <Select
              value={area}
              onChange={(e) => {
                setArea(e.target.value)
                setShown(PAGE)
              }}
              options={[{ value: 'all', label: 'Every feature' }, ...AREAS.map((a) => ({ value: a, label: `${a}.*` }))]}
            />
          </Field>
          <Segmented
            label="Outcome"
            showLabel
            size="sm"
            value={outcome}
            onChange={(o) => {
              setOutcome(o)
              setShown(PAGE)
            }}
            options={[
              { value: 'all', label: `All ${entries.length}` },
              { value: 'ok', label: `OK ${count('ok')}` },
              { value: 'not-implemented', label: `Not wired ${count('not-implemented')}` },
              { value: 'error', label: `Error ${count('error')}` },
            ]}
          />
        </div>
        <p className={styles.count} role="status">
          {matching.length} of {entries.length} calls shown. The last 200 are kept; a reload empties the log.
        </p>

        {matching.length === 0 ? (
          <EmptyState compact icon="queue" title={entries.length === 0 ? 'No calls yet' : 'Nothing matches'}>
            {entries.length === 0
              ? 'The website has not called into src/pwa since this page loaded. Open Settings, press a button there, or probe the seams above.'
              : 'No call fits this feature and outcome. Widen the filters.'}
          </EmptyState>
        ) : (
          <>
            <Table caption="Calls into src/pwa" dense minWidth={0} className={stacked.stack}>
              <THead>
                <Tr>
                  <Th>Clock</Th>
                  <Th>Feature</Th>
                  <Th>Outcome</Th>
                  <Th numeric>Took</Th>
                  <Th>Error</Th>
                </Tr>
              </THead>
              <TBody>
                {visible.map((e) => (
                  <Tr key={e.id} flag={e.outcome === 'error' ? 'error' : undefined}>
                    <Td mono nowrap>
                      <span className={stacked.label}>Clock</span>
                      {formatClock(e.at, true)}
                    </Td>
                    <Td mono className={styles.feature}>
                      <span className={stacked.label}>Feature</span>
                      {e.feature}
                    </Td>
                    <Td>
                      <span className={stacked.label}>Outcome</span>
                      <OutcomeStamp outcome={e.outcome} />
                    </Td>
                    <Td mono numeric nowrap>
                      <span className={stacked.label}>Took</span>
                      {formatDuration(e.durationMs)}
                    </Td>
                    <Td mono className={styles.error}>
                      <span className={stacked.label}>Error</span>
                      {e.error ? `${e.error.kind}: ${e.error.message}` : <span className="muted">none</span>}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            {matching.length > visible.length ? (
              <Button size="sm" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, matching.length - visible.length)} more
              </Button>
            ) : null}
          </>
        )}
      </div>
    </Plate>
  )
}
