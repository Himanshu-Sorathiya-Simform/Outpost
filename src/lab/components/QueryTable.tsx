import { TBody, THead, Table, Td, Th, TimeAgo, Tr, formatBytes } from '@/ui'
import type { QueryAction } from './QueryActions'
import type { QueryRowData } from './QueryModel'
import { QueryRowActions } from './QueryRowActions'
import { QueryStateCell } from './QueryStateCell'
import styles from './QueryTable.module.css'

export interface QueryTableProps {
  rows: QueryRowData[]
  selected: string | null
  onInspect: (hash: string) => void
  onAction: (action: QueryAction, row: QueryRowData) => void
}

/** One line per cache entry. The key is the row header; everything else is read straight from the entry's state. */
export function QueryTable({ rows, selected, onInspect, onAction }: QueryTableProps) {
  return (
    <Table caption="React Query cache entries" captionHidden dense minWidth={820}>
      <THead>
        <tr>
          <Th>Key</Th>
          <Th>State</Th>
          <Th numeric>Observers</Th>
          <Th>Updated</Th>
          <Th numeric>Errors</Th>
          <Th numeric>Size</Th>
          <Th>Actions</Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.hash} selected={row.hash === selected} flag={row.status === 'error' ? 'error' : undefined}>
            <Td role="rowheader" className={styles.key}>
              <span className={styles.keyText}>{row.keyText}</span>
              <span className={styles.url}>{row.url ?? 'no meta.url'}</span>
            </Td>
            <Td>
              <QueryStateCell row={row} />
            </Td>
            <Td numeric>{row.observers}</Td>
            <Td nowrap>{row.updatedAt > 0 ? <TimeAgo at={row.updatedAt} /> : <span className={styles.none}>never</span>}</Td>
            <Td numeric>{row.errorUpdateCount}</Td>
            <Td numeric nowrap>
              {row.bytes === null ? <span className={styles.none}>no data</span> : formatBytes(row.bytes)}
            </Td>
            <Td>
              <QueryRowActions row={row} onAction={onAction} onInspect={() => onInspect(row.hash)} />
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}
