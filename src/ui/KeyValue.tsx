import type { ReactNode } from 'react'
import { cx } from './internal/cx'
import styles from './KeyValue.module.css'

export interface KeyValueItem {
  label: ReactNode
  value: ReactNode
  /** Render the value in mono (ids, headers, timestamps). Default true. */
  mono?: boolean
  /** Skip the row when false. Handy for `{ ...cond && item }` style lists. */
  show?: boolean
}

export interface KeyValueProps {
  items: KeyValueItem[]
  /** `leader` dots between label and value; `stacked` puts the label above the value. */
  layout?: 'leader' | 'stacked'
  columns?: 1 | 2
  dense?: boolean
  className?: string
}

/** Values longer than this would wrap beside their label and strand a dot leader, so the row stacks instead. */
const STACK_AT = 28

function isLong(value: ReactNode): boolean {
  return (typeof value === 'string' || typeof value === 'number') && String(value).length > STACK_AT
}

/** A definition list in ledger style, with dot leaders like a table of contents. */
export function KeyValue({ items, layout = 'leader', columns = 1, dense = false, className }: KeyValueProps) {
  return (
    <dl className={cx(styles.list, layout === 'stacked' && styles.stacked, columns === 2 && styles.two, dense && styles.dense, className)}>
      {items
        .filter((i) => i.show !== false)
        .map((it, idx) => (
          <div key={idx} className={cx(styles.row, layout === 'leader' && isLong(it.value) && styles.long)}>
            <dt className={styles.key}>{it.label}</dt>
            {layout === 'leader' && !isLong(it.value) ? <span className={styles.leader} aria-hidden="true" /> : null}
            <dd className={cx(styles.val, it.mono !== false && styles.mono)}>{it.value}</dd>
          </div>
        ))}
    </dl>
  )
}
