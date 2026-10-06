import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { Icon } from './icons'
import { cx } from './internal/cx'
import styles from './Table.module.css'

export interface TableProps extends Omit<HTMLAttributes<HTMLTableElement>, 'children'> {
  /** Names the table. Printed above it as a figure caption unless `captionHidden`. */
  caption: string
  captionHidden?: boolean
  dense?: boolean
  stickyHead?: boolean
  /** Minimum width before the table scrolls sideways instead of squashing. */
  minWidth?: number | string
  children: ReactNode
}

/** Ledger table: rules instead of zebra stripes. Scrolls inside its own keyboard-focusable region. */
export function Table({ caption, captionHidden = false, dense = false, stickyHead = false, minWidth = 560, className, children, ...rest }: TableProps) {
  return (
    <div className={cx(styles.scroll, stickyHead && styles.sticky)} role="region" aria-label={caption} tabIndex={0}>
      <table className={cx(styles.table, dense && styles.dense, className)} style={{ minWidth }} {...rest}>
        <caption className={cx(styles.caption, captionHidden && 'sr-only')}>{caption}</caption>
        {children}
      </table>
    </div>
  )
}

export const THead = (p: HTMLAttributes<HTMLTableSectionElement>) => <thead {...p} />
export const TBody = (p: HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} />
export const TFoot = ({ className, ...p }: HTMLAttributes<HTMLTableSectionElement>) => <tfoot className={cx(styles.foot, className)} {...p} />

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean
  /** A coloured tab in the left margin of the row (plus the row's own content must say why). */
  flag?: 'ok' | 'warn' | 'error'
}
export function Tr({ selected, flag, className, ...p }: TrProps) {
  return <tr className={cx(selected && styles.selected, flag && styles[`flag_${flag}`], className)} aria-selected={selected} {...p} />
}

export interface ThProps extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'onClick'> {
  numeric?: boolean
  /** Makes the header a sort button. `sort` is the column's current state. */
  onSort?: () => void
  sort?: 'asc' | 'desc' | 'none'
}
export function Th({ numeric, onSort, sort = 'none', className, children, scope = 'col', ...p }: ThProps) {
  const ariaSort = onSort ? (sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none') : undefined
  return (
    <th scope={scope} aria-sort={ariaSort} className={cx(styles.th, numeric && styles.numeric, className)} {...p}>
      {onSort ? (
        <button type="button" className={styles.sortBtn} onClick={onSort}>
          {children}
          <Icon name={sort === 'asc' ? 'arrow-up' : sort === 'desc' ? 'arrow-down' : 'chevron-down'} size={12} className={cx(sort === 'none' && styles.sortIdle)} />
        </button>
      ) : (
        children
      )}
    </th>
  )
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean
  /** Mono text, for ids, urls and timestamps. */
  mono?: boolean
  /** Do not wrap. */
  nowrap?: boolean
}
export function Td({ numeric, mono, nowrap, className, ...p }: TdProps) {
  return <td className={cx(styles.td, numeric && styles.numeric, mono && styles.mono, nowrap && styles.nowrap, className)} {...p} />
}
