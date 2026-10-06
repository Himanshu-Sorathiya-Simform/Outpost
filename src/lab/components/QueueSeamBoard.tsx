import { useState } from 'react'
import { useBridgeLog, type BridgeLogEntry } from '@/lib'
import { Button, Meter, Plate, Table, TBody, Td, Th, THead, TimeAgo, Tr, cx } from '@/ui'
import { probeAllSeams, PROBE_COUNT, type ProbeResult } from './QueueProbe'
import { SEAM_METHODS } from './QueueSeamMethods'
import { OutcomeStamp } from './QueueStamp'
import stacked from './ServerStacked.module.css'
import styles from './QueueSeamBoard.module.css'

const lastCall = (entries: BridgeLogEntry[], feature: string): BridgeLogEntry | undefined => entries.find((e) => e.feature === feature)

function Tile({ feature, file, answersEarly, last }: { feature: string; file: string; answersEarly?: boolean; last: BridgeLogEntry | undefined }) {
  return (
    <li className={cx(styles.tile, last?.outcome === 'ok' && styles.wired)}>
      <span className={styles.name}>{feature}</span>
      <span className={styles.line}>
        {last ? (
          <>
            <OutcomeStamp outcome={last.outcome} />
            <span className={styles.age}>
              <TimeAgo at={last.at} /> in {last.durationMs} ms
            </span>
          </>
        ) : (
          <span className={styles.age}>No calls yet</span>
        )}
      </span>
      {last?.outcome === 'error' && last.error ? <p className={styles.problem}>{last.error.kind}: {last.error.message}</p> : null}
      <span className={styles.file}>
        {file}
        {answersEarly ? ', answers from the start' : ''}
      </span>
    </li>
  )
}

/** One tile per seam method. A tile turns from Not wired to OK when the learner makes the call answer. */
export function QueueSeamBoard() {
  const entries = useBridgeLog((s) => s.entries)
  const [results, setResults] = useState<ProbeResult[] | null>(null)
  const [probing, setProbing] = useState(false)

  const states = SEAM_METHODS.map((m) => ({ ...m, last: lastCall(entries, m.feature) }))
  // Methods that answer from the start say nothing about progress, so the meter counts only the ones that begin as stubs.
  const toWire = states.filter((s) => !s.answersEarly)
  const ok = toWire.filter((s) => s.last?.outcome === 'ok').length
  const failing = toWire.filter((s) => s.last?.outcome === 'error').length

  const probe = async (): Promise<void> => {
    setProbing(true)
    try {
      setResults(await probeAllSeams())
    } finally {
      setProbing(false)
    }
  }

  return (
    <Plate index="Nº 0001" title="Seam board">
      <div className={styles.body}>
        <p className={styles.lede}>
          Every call the website makes into <code>src/pwa</code> goes through one wrapper, and each lands here. A tile shows the latest outcome for that method. Methods nobody has called yet say so; use the buttons around the site, or
          probe the read-only ones below.
        </p>
        <Meter
          label="Stubs now answering"
          value={ok}
          max={toWire.length}
          segments={toWire.length}
          tone="ok"
          valueText={`${ok} of ${toWire.length} OK${failing > 0 ? `, ${failing} failing` : ''}`}
        />
        <ul className={styles.grid} aria-label="Seam methods and their latest outcome">
          {states.map((s) => (
            <Tile key={s.feature} feature={s.feature} file={s.file} answersEarly={s.answersEarly} last={s.last} />
          ))}
        </ul>

        <div className={styles.probe}>
          <div className={styles.probeRow}>
            <Button icon="refresh" loading={probing} onClick={() => void probe()}>
              Probe all seams
            </Button>
            <p className={styles.note}>
              Calls the {PROBE_COUNT} read-only methods once: permission, getSubscription, listQueued, isSupported, periodic list and canShare. Nothing is written, subscribed or shown.
            </p>
          </div>
          <div role="status" aria-live="polite">
            {results ? (
              <Table caption="Probe results" dense minWidth={0} className={stacked.stack}>
                <THead>
                  <Tr>
                    <Th>Method</Th>
                    <Th>Outcome</Th>
                    <Th>Returned</Th>
                  </Tr>
                </THead>
                <TBody>
                  {results.map((r) => (
                    <Tr key={r.feature} flag={r.outcome === 'error' ? 'error' : undefined}>
                      <Td mono>
                        <span className={stacked.label}>Method</span>
                        {r.feature}
                      </Td>
                      <Td>
                        <span className={stacked.label}>Outcome</span>
                        <OutcomeStamp outcome={r.outcome} />
                      </Td>
                      <Td mono className={styles.value}>
                        <span className={stacked.label}>Returned</span>
                        {r.error ?? r.value ?? <span className="muted">{r.outcome === 'not-implemented' ? 'a stub answered' : 'nothing'}</span>}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : null}
          </div>
        </div>
      </div>
    </Plate>
  )
}
