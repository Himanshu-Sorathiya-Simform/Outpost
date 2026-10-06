import type { Query } from '@tanstack/react-query'
import { useLabSetting } from '@/lib'
import { Drawer, EmptyState, ErrorState, JsonView, KeyValue, ProvenanceChip, formatBytes, formatStamp } from '@/ui'
import type { QueryAction } from './QueryActions'
import { countPages, describeQuery, responseMetas, type QueryRowData } from './QueryModel'
import { QueryRowActions } from './QueryRowActions'
import styles from './QueryDetail.module.css'

export interface QueryDetailProps {
  /** The entry being inspected, or undefined when it has been removed under the drawer. */
  query: Query | undefined
  open: boolean
  onClose: () => void
  onAction: (action: QueryAction, row: QueryRowData) => void
}

function Body({ query, onAction }: { query: Query; onAction: QueryDetailProps['onAction'] }) {
  const showProvenance = useLabSetting('showProvenance')
  const row = describeQuery(query)
  const { state } = query
  const metas = responseMetas(state.data)
  const pages = countPages(state.data)
  return (
    <div className={styles.body}>
      <QueryRowActions row={row} onAction={onAction} />
      <KeyValue
        dense
        items={[
          { label: 'Key', value: JSON.stringify(query.queryKey) },
          { label: 'Hash', value: query.queryHash },
          { label: 'Status', value: `${state.status} / ${state.fetchStatus}` },
          { label: 'Freshness', value: row.status !== 'success' ? 'no data' : row.stale ? 'stale' : 'fresh' },
          { label: 'Observers', value: row.observers },
          { label: 'Data updated', value: state.dataUpdatedAt > 0 ? formatStamp(state.dataUpdatedAt) : 'never' },
          { label: 'Data updates', value: state.dataUpdateCount },
          { label: 'Error updates', value: state.errorUpdateCount },
          { label: 'Failed attempts', value: state.fetchFailureCount, show: state.fetchFailureCount > 0 },
          { label: 'Invalidated', value: state.isInvalidated ? 'yes' : 'no' },
          { label: 'Collected after', value: `${Math.round(query.gcTime / 60_000)} min unused` },
          { label: 'meta.url', value: row.url ?? 'none' },
          { label: 'Size', value: row.bytes === null ? 'no data' : formatBytes(row.bytes) },
          { label: 'Pages held', value: pages, show: pages !== null },
        ]}
      />
      {row.error ? <ErrorState compact error={row.error} /> : null}
      {state.data !== undefined && metas[0] ? (
        <section className={styles.prov} aria-label="Provenance of this data">
          <h3 className={styles.label}>{pages !== null ? 'Provenance of page 1' : 'Provenance'}</h3>
          {showProvenance ? (
            <ProvenanceChip meta={metas[0]} />
          ) : (
            <p className={styles.muted}>Switched off in the settings below. The record is still in the cache: it is the meta field of the value.</p>
          )}
        </section>
      ) : null}
      {state.data === undefined ? (
        <EmptyState compact title="No data" icon="cache">
          This entry has never succeeded, or was reset. Refetch to fill it.
        </EmptyState>
      ) : (
        <JsonView value={state.data} title="Cached value" expandDepth={2} maxHeight={340} />
      )}
    </div>
  )
}

/** The inspector: state, provenance and the cached value of one entry, with the same actions as its row. Follows the entry live. */
export function QueryDetail({ query, open, onClose, onAction }: QueryDetailProps) {
  return (
    <Drawer open={open} onClose={onClose} title={query ? 'Cache entry' : 'Entry removed'} description={query ? query.queryHash : undefined}>
      {query ? (
        <Body query={query} onAction={onAction} />
      ) : (
        <EmptyState compact title="Removed from the cache" icon="trash">
          This entry was deleted, or collected after going unused. Close the drawer and pick another.
        </EmptyState>
      )}
    </Drawer>
  )
}
