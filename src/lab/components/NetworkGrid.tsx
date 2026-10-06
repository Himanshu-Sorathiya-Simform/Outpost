import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '@/ui'
import styles from './NetworkGrid.module.css'

export interface GridColumn<T> {
  id: string
  header: string
  /** A CSS grid track: '6rem' or 'minmax(8rem, 1fr)'. */
  width: string
  render: (row: T) => ReactNode
  numeric?: boolean
  /** On a phone each row wraps into two lines: 'hide' drops the column, 'wide' puts it on the second line. */
  narrow?: 'hide' | 'wide'
}

export interface NetworkGridProps<T> {
  rows: readonly T[]
  columns: readonly GridColumn<T>[]
  rowKey: (row: T) => string
  /** Accessible name of the table. */
  label: string
  /** The column whose cell holds the keyboard-focusable button that opens the row. Needs `onOpen`. */
  openColumn?: string
  openLabel?: (row: T) => string
  onOpen?: (row: T) => void
  selectedKey?: string | null
  flag?: (row: T) => 'ok' | 'warn' | 'error' | undefined
  minWidth?: string
  className?: string
}

const OVERSCAN = 8
const FALLBACK_ROW_PX = 34
const FALLBACK_VIEW_PX = 520

/**
 * A ledger that only draws the rows on screen. The log rings hold up to 500 rows and a live tail rewrites them
 * several times a second, so the DOM holds about thirty. Rows have one fixed height (two lines on a phone), which is
 * what lets the scroll position stand in for the row index. Arrow keys, Home, End and Page keys move between rows.
 */
export function NetworkGrid<T>({ rows, columns, rowKey, label, openColumn, openLabel, onOpen, selectedKey, flag, minWidth = '58rem', className }: NetworkGridProps<T>) {
  const scroller = useRef<HTMLDivElement>(null)
  const firstRow = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewPx, setViewPx] = useState(FALLBACK_VIEW_PX)
  const [rowPx, setRowPx] = useState(FALLBACK_ROW_PX)
  const pendingFocus = useRef<number | null>(null)

  const measure = useCallback((): void => {
    const h = firstRow.current?.getBoundingClientRect().height
    if (h) setRowPx((prev) => (Math.abs(h - prev) > 0.5 ? h : prev))
  }, [])

  // The row height changes with the breakpoint, so it is re-read whenever the box is resized.
  useEffect(() => {
    const el = scroller.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      setViewPx(el.clientHeight || FALLBACK_VIEW_PX)
      measure()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  const hasRows = rows.length > 0
  useLayoutEffect(() => {
    if (hasRows) measure()
  }, [hasRows, measure])

  const start = Math.max(0, Math.floor(scrollTop / rowPx) - OVERSCAN)
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewPx) / rowPx) + OVERSCAN)
  const visible = rows.slice(start, end)

  useEffect(() => {
    const target = pendingFocus.current
    if (target === null) return
    pendingFocus.current = null
    scroller.current?.querySelector<HTMLElement>(`[data-index="${target}"] button[data-open]`)?.focus()
  })

  const onScroll = useCallback(() => setScrollTop(scroller.current?.scrollTop ?? 0), [])

  const focusIndex = (index: number): void => {
    const el = scroller.current
    if (!el || rows.length === 0) return
    const i = Math.min(rows.length - 1, Math.max(0, index))
    const top = i * rowPx
    const headerPx = el.querySelector<HTMLElement>('[data-head]')?.offsetHeight ?? 0
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + rowPx > el.scrollTop + el.clientHeight - headerPx) el.scrollTop = top + rowPx - el.clientHeight + headerPx
    pendingFocus.current = i
    setScrollTop(el.scrollTop)
    const row = el.querySelector<HTMLElement>(`[data-index="${i}"] button[data-open]`)
    if (row) {
      row.focus()
      pendingFocus.current = null
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const current = (e.target as HTMLElement).closest<HTMLElement>('[data-index]')
    if (!current || !(e.target as HTMLElement).matches('button[data-open]')) return
    const index = Number(current.dataset.index)
    const page = Math.max(1, Math.floor(viewPx / rowPx) - 1)
    const moves: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, PageDown: index + page, PageUp: index - page, Home: 0, End: rows.length - 1 }
    const target = moves[e.key]
    if (target === undefined) return
    e.preventDefault()
    focusIndex(target)
  }

  const cols = columns.map((c) => c.width).join(' ')
  const vars = { '--cols': cols, '--min-w': minWidth } as CSSProperties

  return (
    <div
      ref={scroller}
      className={cx(styles.scroll, className)}
      style={vars}
      role="table"
      aria-label={label}
      aria-rowcount={rows.length + 1}
      tabIndex={rows.length === 0 || !onOpen ? 0 : -1}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
    >
      <div className={styles.inner}>
        <div className={cx(styles.row, styles.head)} role="row" aria-rowindex={1} data-head="">
          {columns.map((c) => (
            <div key={c.id} className={cx(styles.cell, c.numeric && styles.numeric)} role="columnheader" data-narrow={c.narrow}>
              {c.header}
            </div>
          ))}
        </div>
        <div className={styles.body} style={{ paddingTop: start * rowPx, paddingBottom: (rows.length - end) * rowPx }} role="rowgroup">
          {visible.map((row, i) => {
            const key = rowKey(row)
            const f = flag?.(row)
            return (
              <div
                key={key}
                ref={i === 0 ? firstRow : undefined}
                className={cx(styles.row, styles.data, selectedKey === key && styles.selected)}
                role="row"
                aria-rowindex={start + i + 2}
                aria-selected={onOpen ? selectedKey === key : undefined}
                data-index={start + i}
                data-flag={f}
                onClick={onOpen ? () => onOpen(row) : undefined}
              >
                {columns.map((c) => (
                  <div key={c.id} className={cx(styles.cell, c.numeric && styles.numeric)} role="cell" data-narrow={c.narrow}>
                    {c.id === openColumn && onOpen ? (
                      <button type="button" data-open="" className={styles.open} aria-label={openLabel?.(row)} onClick={(e) => { e.stopPropagation(); onOpen(row) }}>
                        {c.render(row)}
                      </button>
                    ) : (
                      c.render(row)
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
