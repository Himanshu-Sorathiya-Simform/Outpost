import { useState } from 'react'
import { Button, Plate, StatusDot, TBody, THead, Table, Td, Th, Tr } from '@/ui'
import { FactCell, GapCell, LayerHead } from './ConsistencyCells'
import { ConsistencyExplain } from './ConsistencyExplain'
import {
  INBOX_METRICS,
  LAYER_LABEL,
  diagnoseInbox,
  differs,
  suspectsFor,
  type BadgeInfo,
  type Diagnosis,
  type Drift,
  type InboxFacts,
  type InboxMetric,
  type MismatchClass,
  type ReactDiag,
  type Reading,
} from './ConsistencyModel'
import styles from './ConsistencyTables.module.css'

interface Props {
  server: Reading<InboxFacts>
  react: Reading<InboxFacts>
  reactDiag: ReactDiag | null
  storage: Reading<InboxFacts>
  badge: Reading<InboxFacts>
  badgeInfo: BadgeInfo
  /** "badge.set, not wired" and whether the value was observed. */
  badgeNote: string | null
  badgeInferred: boolean
}

const valueOf = (r: Reading<InboxFacts>): InboxFacts | null => (r.status === 'ok' ? r.value : null)
const IS_REV: ReadonlySet<InboxMetric> = new Set<InboxMetric>(['inboxRev', 'feedRev'])

function suspectsOf(metric: InboxMetric, react: InboxFacts | null, storage: InboxFacts | null, server: InboxFacts | null): MismatchClass[] {
  if (!server) return []
  const driftOf = (layer: InboxFacts | null): Drift | null => {
    const v = layer?.[metric] ?? null
    const s = server[metric]
    if (!differs(v, s) || v === null || s === null) return null
    return IS_REV.has(metric) ? (v < s ? 'behind' : 'ahead') : 'flags'
  }
  const r = driftOf(react)
  const same = react !== null && storage !== null && react[metric] === storage[metric]
  // A changed counter could be a stale copy or an optimistic write that never settled; a changed revision cannot be optimistic.
  const base = suspectsFor(r, driftOf(storage), same)
  return r === 'flags' ? [...new Set([...base, ...suspectsFor('behind', null, same)])] : base
}

/** Table 1: unread, urgent and feedRev across the four layers, with a sentence for each layer that disagrees. */
export function ConsistencyInboxTable({ server, react, reactDiag, storage, badge, badgeInfo, badgeNote, badgeInferred }: Props) {
  const [open, setOpen] = useState<InboxMetric | null>(null)
  const sv = valueOf(server)
  const rv = valueOf(react)
  const cv = valueOf(storage)
  const bv = valueOf(badge)
  const gaps = (
    [
      ['server', server],
      ['react', react],
      ['storage', storage],
      ['badge', badge],
    ] as const
  ).flatMap(([layer, reading]) => (reading.status === 'empty' || reading.status === 'unavailable' ? [{ layer, note: reading.note }] : []))
  const diagnoses: Diagnosis[] = sv ? diagnoseInbox({ server: sv, react: rv, storage: cv, badge: bv, reactDiag, badgeInfo }) : []

  const toggle = (metric: InboxMetric): void => setOpen((current) => (current === metric ? null : metric))

  return (
    <Plate index={500} title="Inbox" flush>
      <Table caption="The same inbox facts at four layers" minWidth={760}>
        <THead>
          <Tr>
            <Th>Fact</Th>
            <Th>
              <LayerHead label={LAYER_LABEL.server} reading={server} />
            </Th>
            <Th>
              <LayerHead label={LAYER_LABEL.react} reading={react} extra={reactDiag?.error ? `refetch failed: ${reactDiag.error.kind}` : reactDiag?.paused ? 'refetch paused' : undefined} />
            </Th>
            <Th>
              <LayerHead label={LAYER_LABEL.storage} reading={storage} />
            </Th>
            <Th>
              <LayerHead label={LAYER_LABEL.badge} reading={badge} extra={badgeNote ? `${badgeNote}${badgeInferred ? ', value inferred' : ''}` : undefined} />
            </Th>
            <Th>Why</Th>
          </Tr>
        </THead>
        <TBody>
          {INBOX_METRICS.map(({ key, label }) => {
            const badgeApplies = key === 'unread'
            const reference = badgeApplies ? (rv?.unread ?? sv?.unread ?? null) : null
            const mismatch =
              sv !== null &&
              (differs(rv?.[key] ?? null, sv[key]) || differs(cv?.[key] ?? null, sv[key]) || (badgeApplies && differs(bv?.unread ?? null, reference)))
            const expanded = open === key
            return (
              <Tr key={key} flag={sv === null ? undefined : mismatch ? 'warn' : 'ok'}>
                <Td>{label}</Td>
                <Td>{sv ? <FactCell value={sv[key]} server={sv[key]} isServer /> : <GapCell reading={server} />}</Td>
                <Td>{rv ? <FactCell value={rv[key]} server={sv?.[key] ?? null} /> : <GapCell reading={react} />}</Td>
                <Td>{cv ? <FactCell value={cv[key]} server={sv?.[key] ?? null} /> : <GapCell reading={storage} />}</Td>
                <Td>
                  {!badgeApplies ? (
                    <span className={styles.na}>n/a</span>
                  ) : bv ? (
                    <FactCell value={bv.unread} server={reference} against={rv ? 'React' : 'server'} />
                  ) : (
                    <GapCell reading={badge} />
                  )}
                </Td>
                <Td nowrap>
                  <Button size="sm" variant="quiet" aria-expanded={expanded} aria-controls="explain-inbox" onClick={() => toggle(key)}>
                    {expanded ? 'Hide' : 'Explain'}
                    <span className="sr-only"> {label}</span>
                  </Button>
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </Table>
      {open ? (
        <div id="explain-inbox" className={styles.explain}>
          <p className={styles.explainFor}>{INBOX_METRICS.find((m) => m.key === open)?.label}</p>
          <ConsistencyExplain suspects={suspectsOf(open, rv, cv, sv)} />
        </div>
      ) : null}
      <div className={styles.diagnosis}>
        {diagnoses.length === 0 ? (
          <p className={styles.line}>
            <StatusDot tone={sv ? 'ok' : 'idle'} title={sv ? 'Agreement' : 'Waiting'} />
            <span>{sv ? 'Every layer that could be read agrees with the server.' : 'Waiting for the server truth before judging anything.'}</span>
          </p>
        ) : (
          <ul className={styles.causes} aria-label="Probable causes">
            {diagnoses.map((d) => (
              <li key={d.layer} className={styles.cause}>
                <span className={styles.layer}>{LAYER_LABEL[d.layer]}</span>
                <span>{d.text}</span>
              </li>
            ))}
          </ul>
        )}
        {gaps.length > 0 ? (
          <ul className={styles.gaps} aria-label="Layers with nothing to compare">
            {gaps.map((g) => (
              <li key={g.layer}>
                <span className={styles.layerQuiet}>{LAYER_LABEL[g.layer]}</span> {g.note}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Plate>
  )
}
