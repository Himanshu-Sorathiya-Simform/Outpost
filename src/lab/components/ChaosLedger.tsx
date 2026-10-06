import { useState } from 'react'
import { Button, EmptyState, formatClock, formatDuration, Meter, Plate, SourceGlyph, SOURCE_LABEL, Table, TBody, Td, Th, THead, Tr } from '@/ui'
import { outcomeKey, tally, useProbeStore, type ProbeAttempt } from './ChaosProbeStore'
import styles from './ChaosLedger.module.css'

const SHOWN = 40

/** Did the client see the symptom the saved chaos state predicted? A rule with probability under 1 will sometimes miss. */
function verdict(a: ProbeAttempt): string {
  if (a.predictions.length === 0) return 'no fault predicted'
  const key = outcomeKey(a.outcome)
  if (a.predictions.some((p) => p.expected.includes(key))) return 'as predicted'
  if (key === 'ok' && a.predictions.some((p) => p.chance < 1)) return 'rule did not fire (it is a chance)'
  return 'not as predicted'
}

function Outcome({ attempt }: { attempt: ProbeAttempt }) {
  const o = attempt.outcome
  if (o.ok) return <span className={styles.ok}>OK {o.status}</span>
  return <span className={styles.kind}>{o.kind}</span>
}

function Detail({ attempt }: { attempt: ProbeAttempt }) {
  const o = attempt.outcome
  if (o.ok) {
    return (
      <span className={styles.source}>
        <SourceGlyph source={o.source} />
        {SOURCE_LABEL[o.source]}
      </span>
    )
  }
  return <span title={o.message}>{o.userMessage}</span>
}

function Histogram({ attempts }: { attempts: readonly ProbeAttempt[] }) {
  const rows = tally(attempts)
  const max = rows[0]?.count ?? 1
  return (
    <div className={styles.hist} role="group" aria-label="Outcomes by kind">
      {rows.map((r) => (
        <Meter key={r.key} label={r.key === 'ok' ? 'ok' : r.key} value={r.count} max={max} segments={16} size="sm" tone={r.key === 'ok' ? 'ok' : 'error'} valueText={String(r.count)} />
      ))}
    </div>
  )
}

/** Every probe attempt, newest first, with a tally by outcome. Survives leaving the page. */
export function ChaosLedger() {
  const attempts = useProbeStore((s) => s.attempts)
  const clear = useProbeStore((s) => s.clear)
  const [all, setAll] = useState(false)
  const shown = all ? attempts : attempts.slice(0, SHOWN)
  return (
    <Plate
      index="Nº 0706"
      title="Results"
      actions={
        <Button size="sm" variant="quiet" icon="trash" disabled={attempts.length === 0} onClick={clear}>
          Clear results
        </Button>
      }
    >
      {attempts.length === 0 ? (
        <EmptyState compact icon="bolt" title="Nothing fired yet">
          Switch something on above, pick a target and fire. Each attempt shows up here with what the client made of it.
        </EmptyState>
      ) : (
        <div className={styles.stack}>
          <Histogram attempts={attempts} />
          <Table caption={`Probe attempts, newest first (${attempts.length})`} dense minWidth={640}>
            <THead>
              <Tr>
                <Th>Time</Th>
                <Th>Target</Th>
                <Th>Outcome</Th>
                <Th numeric>Took</Th>
                <Th>Detail</Th>
                <Th>X-Chaos</Th>
                <Th>Expected</Th>
              </Tr>
            </THead>
            <TBody>
              {shown.map((a) => (
                <Tr key={a.id} flag={a.outcome.ok ? undefined : 'error'}>
                  <Td nowrap>{formatClock(a.at)}</Td>
                  <Td>{a.targetLabel}</Td>
                  <Td nowrap>
                    <Outcome attempt={a} />
                  </Td>
                  <Td numeric nowrap>
                    {formatDuration(a.outcome.durationMs)}
                  </Td>
                  <Td>
                    <Detail attempt={a} />
                  </Td>
                  <Td mono>{a.outcome.chaos ?? '-'}</Td>
                  <Td>{verdict(a)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {attempts.length > SHOWN ? (
            <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>
              {all ? `Show the latest ${SHOWN}` : `Show all ${attempts.length}`}
            </Button>
          ) : null}
        </div>
      )}
    </Plate>
  )
}
