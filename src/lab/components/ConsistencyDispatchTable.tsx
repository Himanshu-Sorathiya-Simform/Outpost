import { useState } from 'react'
import type { LabTruth } from '@shared/contracts'
import { Button, EmptyState, LinkButton, Plate, StatusDot, TBody, THead, Table, Tag, Td, Th, Tr } from '@/ui'
import { FlagsCell, GapCell, LayerHead } from './ConsistencyCells'
import { ConsistencyExplain } from './ConsistencyExplain'
import { LAYER_LABEL, driftOf, suspectsFor, type DispatchFacts, type Drift, type Reading } from './ConsistencyModel'
import type { ReactDispatch } from './ConsistencyReact'
import { storageReading, type StorageSnapshot } from './ConsistencyStorage'
import styles from './ConsistencyTables.module.css'

interface Props {
  rows: ReactDispatch[]
  truth: LabTruth | undefined
  server: Reading<unknown>
  storage: StorageSnapshot | null
  /** Oldest data React holds among the rows, for the column head. */
  reactAt: number | null
}

function driftTag(drift: Drift, layer: DispatchFacts, server: DispatchFacts) {
  if (drift === 'match') return null
  const text = drift === 'behind' ? `behind by ${server.rev - layer.rev}` : drift === 'ahead' ? `ahead by ${layer.rev - server.rev}` : 'flags differ'
  return (
    <Tag tone="warn" icon="warning">
      {text}
    </Tag>
  )
}

interface Analysis {
  svFacts: DispatchFacts | null
  cvFacts: DispatchFacts | null
  copy: Reading<DispatchFacts>
  reactDrift: Drift | null
  storageDrift: Drift | null
  wrong: boolean
  /** Cache Storage holds exactly what React holds. */
  same: boolean
}

function analyse(row: ReactDispatch, truth: LabTruth | undefined, storage: StorageSnapshot | null): Analysis {
  const sv = truth?.dispatches.find((d) => d.id === row.id) ?? null
  const svFacts: DispatchFacts | null = sv ? { rev: sv.rev, read: sv.read, acked: sv.acked, starred: sv.starred } : null
  const copy = storageReading(storage, (ready) => ready.dispatches[row.id])
  const cvFacts = copy.status === 'ok' ? copy.value : null
  const reactDrift = svFacts ? driftOf(row.best, svFacts) : null
  const storageDrift = svFacts && cvFacts ? driftOf(cvFacts, svFacts) : null
  return {
    svFacts,
    cvFacts,
    copy,
    reactDrift,
    storageDrift,
    wrong: (reactDrift !== null && reactDrift !== 'match') || (storageDrift !== null && storageDrift !== 'match'),
    same: cvFacts !== null && driftOf(cvFacts, row.best) === 'match',
  }
}

const mismatchOnly = (d: Drift | null): Drift | null => (d === 'match' ? null : d)

/** Table 2: the first dispatches in React's feed cache, revision and flags at each layer, mismatches marked. */
export function ConsistencyDispatchTable({ rows, truth, server, storage, reactAt }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const toggle = (id: string): void => setOpen((current) => (current === id ? null : id))
  const openRow = rows.find((r) => r.id === open)
  const openAnalysis = openRow ? analyse(openRow, truth, storage) : null
  const reactReading: Reading<unknown> = rows.length > 0 ? { status: 'ok', value: rows, at: reactAt } : { status: 'empty', note: 'No feed cached.' }
  const storageHead: Reading<unknown> =
    storage === null ? { status: 'pending' } : storage.status === 'unavailable' ? { status: 'unavailable', note: storage.note } : { status: 'ok', value: null, at: null }

  return (
    <Plate index={501} title="Dispatches" flush>
      {rows.length === 0 ? (
        <EmptyState
          title="React holds no dispatches"
          action={
            <LinkButton to="/log" size="sm" iconEnd="arrow-right">
              Open the Log
            </LinkButton>
          }
        >
          This table lists what React&apos;s feed cache contains, so it stays empty until the Log has been opened once in this tab.
        </EmptyState>
      ) : (
        <Table caption={`The first ${rows.length} dispatches in React's feed cache`} minWidth={820}>
          <THead>
            <Tr>
              <Th>Dispatch</Th>
              <Th>
                <LayerHead label={LAYER_LABEL.server} reading={server} />
              </Th>
              <Th>
                <LayerHead label={LAYER_LABEL.react} reading={reactReading} />
              </Th>
              <Th>
                <LayerHead label={LAYER_LABEL.storage} reading={storageHead} okNote="read live, per URL" />
              </Th>
              <Th>State</Th>
              <Th>Why</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((row) => {
              const { svFacts, cvFacts, copy, reactDrift, storageDrift, wrong } = analyse(row, truth, storage)
              const expanded = open === row.id
              return (
                  <Tr key={row.id} flag={!svFacts ? undefined : wrong ? 'warn' : 'ok'}>
                    <Td>
                      <span className={styles.id}>
                        <span className={styles.idCode}>{row.id}</span>
                        <span className={styles.title} title={row.title}>
                          {row.title}
                        </span>
                      </span>
                    </Td>
                    <Td>{svFacts ? <FlagsCell facts={svFacts} /> : <span className={styles.na}>{truth ? 'not on the server' : 'reading'}</span>}</Td>
                    <Td>
                      <span className={styles.cell}>
                        <FlagsCell facts={row.best} />
                        {svFacts && reactDrift ? driftTag(reactDrift, row.best, svFacts) : null}
                        {row.splitBrain && row.detail ? (
                          <span className={styles.split}>
                            feed r{row.feed.rev}, detail r{row.detail.rev}
                          </span>
                        ) : null}
                      </span>
                    </Td>
                    <Td>
                      {cvFacts ? (
                        <span className={styles.cell}>
                          <FlagsCell facts={cvFacts} />
                          {svFacts && storageDrift ? driftTag(storageDrift, cvFacts, svFacts) : null}
                        </span>
                      ) : (
                        <GapCell reading={copy} detail />
                      )}
                    </Td>
                    <Td>
                      {!svFacts ? (
                        <span className={styles.na}>-</span>
                      ) : wrong ? (
                        <StatusDot tone="warn" label="Mismatch" />
                      ) : (
                        <StatusDot tone="ok" label="Match" />
                      )}
                    </Td>
                    <Td nowrap>
                      <Button size="sm" variant="quiet" aria-expanded={expanded} aria-controls="explain-dispatch" onClick={() => toggle(row.id)}>
                        {expanded ? 'Hide' : 'Explain'}
                        <span className="sr-only"> {row.id}</span>
                      </Button>
                    </Td>
                  </Tr>
              )
            })}
          </TBody>
        </Table>
      )}
      {openRow ? (
        <div id="explain-dispatch" className={styles.explain}>
          <p className={styles.explainFor}>{openRow.id}</p>
          <ConsistencyExplain suspects={suspectsFor(mismatchOnly(openAnalysis?.reactDrift ?? null), mismatchOnly(openAnalysis?.storageDrift ?? null), openAnalysis?.same ?? false)} />
        </div>
      ) : null}
      <p className={styles.legend}>
        r4 is revision 4. R, A and S are read, acknowledged and starred; a dash means not. A patch that never reached the server leaves the revision alone and changes only the letters.
      </p>
    </Plate>
  )
}
