import { useMemo, useState } from 'react'
import { EmptyState } from '@/ui'
import { JOINED_COLUMNS } from './NetworkColumns'
import { NetworkDetail } from './NetworkDetail'
import { NetworkFilterBar } from './NetworkFilterBar'
import { NetworkGrid } from './NetworkGrid'
import { CLASS_MEANING, NET_CLASSES, type JoinedRow } from './NetworkJoin'
import { NetworkStamp } from './NetworkStamp'
import { applyFilters, type NetFilters } from './NetworkStats'
import type { Tail } from './useNetworkRows'
import styles from './NetworkJoined.module.css'

export interface NetworkJoinedProps {
  tail: Tail
  filters: NetFilters
  onFilters: (next: NetFilters) => void
}

const flagFor = (r: JoinedRow): 'ok' | 'warn' | 'error' | undefined => (r.failed || r.cls === 'pre-server' ? 'error' : r.anomaly ? 'warn' : undefined)

function Legend() {
  return (
    <dl className={styles.legend} aria-label="What each class means">
      {NET_CLASSES.map((c) => (
        <div key={c} className={styles.legendItem}>
          <dt>
            <NetworkStamp cls={c} />
          </dt>
          <dd>{CLASS_MEANING[c]}</dd>
        </div>
      ))}
    </dl>
  )
}

export function NetworkJoined({ tail, filters, onFilters }: NetworkJoinedProps) {
  const [selected, setSelected] = useState<JoinedRow | null>(null)
  const visible = useMemo(() => applyFilters(tail.shown, filters), [tail.shown, filters])
  return (
    <div className={styles.stack}>
      <NetworkFilterBar filters={filters} onChange={onFilters} tail={tail} shown={visible.length} total={tail.shown.length} />
      {visible.length === 0 ? (
        <EmptyState icon="network" title={tail.shown.length === 0 ? 'Nothing logged yet' : 'No row matches these filters'}>
          {tail.shown.length === 0
            ? 'Use the app in another tab, or fire requests from the Chaos probe. Each one lands here as a pair: what the client saw, what the server saw.'
            : 'Loosen a filter, or clear them all. The summary above counts every row regardless.'}
        </EmptyState>
      ) : (
        <NetworkGrid
          rows={visible}
          columns={JOINED_COLUMNS}
          rowKey={(r) => r.key}
          label="Joined request log, newest first"
          openColumn="time"
          openLabel={(r) => `Open details: ${r.method} ${r.path}, ${r.cls}`}
          onOpen={setSelected}
          selectedKey={selected?.key ?? null}
          flag={flagFor}
        />
      )}
      <Legend />
      <NetworkDetail row={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
