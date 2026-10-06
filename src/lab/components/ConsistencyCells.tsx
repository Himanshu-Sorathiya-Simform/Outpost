import type { ReactNode } from 'react'
import { Skeleton, Tag, TimeAgo } from '@/ui'
import { flagString, flagWords, type DispatchFacts, type Reading } from './ConsistencyModel'
import styles from './ConsistencyCells.module.css'

/** Column head for one layer: its name and how old its data is, or why it has none. */
export function LayerHead({ label, reading, extra, okNote }: { label: string; reading: Reading<unknown>; extra?: ReactNode; okNote?: ReactNode }) {
  let sub: ReactNode
  if (reading.status === 'ok') sub = okNote ?? (reading.at === null ? 'no clock on this copy' : <TimeAgo at={reading.at} suffix="old" />)
  else if (reading.status === 'pending') sub = 'reading'
  else sub = reading.status === 'empty' ? 'nothing held' : 'unreadable'
  return (
    <span className={styles.head}>
      <span>{label}</span>
      <span className={styles.sub}>{sub}</span>
      {extra ? <span className={styles.sub}>{extra}</span> : null}
    </span>
  )
}

/** What a layer cell shows when the layer has no value: a short word here, the full reason in the tooltip and under the table. */
export function GapCell({ reading, detail = false }: { reading: Reading<unknown>; detail?: boolean }) {
  if (reading.status === 'pending') return <Skeleton width="3rem" />
  if (reading.status === 'ok') return <span className={styles.gap}>-</span>
  return (
    <span className={styles.gap} title={reading.note}>
      {reading.status === 'empty' ? 'none held' : detail ? `unreadable: ${reading.note}` : 'unreadable'}
    </span>
  )
}

/** A number from one layer, with a mismatch mark when it disagrees with the layer it is judged against (the server, or React for the badge). */
export function FactCell({ value, server, isServer = false, against = 'server' }: { value: number | null; server: number | null; isServer?: boolean; against?: string }) {
  if (value === null) return <span className={styles.gap}>-</span>
  const off = !isServer && server !== null && value !== server
  return (
    <span className={styles.fact}>
      <span className={styles.value}>{value}</span>
      {off ? (
        <Tag tone="warn" icon="warning">
          Differs: {against} {server}
        </Tag>
      ) : !isServer && server !== null ? (
        <span className={styles.same}>same</span>
      ) : null}
    </span>
  )
}

/** `r4 R-S`: revision and flags of a dispatch, readable as text and spelled out for a screen reader. */
export function FlagsCell({ facts }: { facts: DispatchFacts }) {
  return (
    <span className={styles.flags} aria-label={`revision ${facts.rev}, ${flagWords(facts)}`}>
      <span className={styles.value} aria-hidden="true">
        r{facts.rev}
      </span>
      <span className={styles.letters} aria-hidden="true">
        {flagString(facts)}
      </span>
    </span>
  )
}
