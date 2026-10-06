import type { Station, StationKind, StationStatus } from '@shared/contracts'
import { Button, Field, Input, Segmented, Select, type SegmentedOption } from '@/ui'
import { KIND_LABEL, SORT_KEYS, SORT_LABEL, STATUS_LABEL, type SortKey } from './stations'
import type { StationView } from './useStationView'
import styles from './StationsToolbar.module.css'

const STATUSES: readonly StationStatus[] = ['online', 'degraded', 'dark']
const KINDS = Object.keys(KIND_LABEL) as StationKind[]

export interface StationsToolbarProps {
  view: StationView
  stations: readonly Station[]
  shown: number
  /** Show the sort picker (the column headers do the job when the table is on screen). */
  sortPicker: boolean
}

export function StationsToolbar({ view, stations, shown, sortPicker }: StationsToolbarProps) {
  const { filters, sort } = view
  const count = (status: StationStatus): number => stations.filter((s) => s.status === status).length
  const statusOptions: SegmentedOption<StationStatus | 'all'>[] = [
    { value: 'all', label: `All ${stations.length}` },
    ...STATUSES.map((s) => ({ value: s, label: `${STATUS_LABEL[s]} ${count(s)}` })),
  ]

  return (
    <div className={styles.bar} role="search" aria-label="Filter stations">
      <div className={styles.row}>
        <Segmented label="Filter by status" size="sm" options={statusOptions} value={filters.status} onChange={(v) => view.setFilter('status', v)} />
        <Field label="Kind" labelHidden className={styles.kind}>
          <Select
            value={filters.kind}
            onChange={(e) => view.setFilter('kind', e.target.value === 'all' ? 'all' : (KINDS.find((k) => k === e.target.value) ?? 'all'))}
            options={[{ value: 'all', label: 'All kinds' }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))]}
          />
        </Field>
        <Field label="Search code, name or region" labelHidden className={styles.search}>
          <Input type="search" leading="search" placeholder="Code, name or region" value={filters.q} onChange={(e) => view.setFilter('q', e.target.value)} autoComplete="off" />
        </Field>
        {sortPicker ? (
          <Field label="Sort by" labelHidden className={styles.kind}>
            <Select
              value={sort.key}
              onChange={(e) => {
                const key = SORT_KEYS.find((k) => k === e.target.value)
                if (key && key !== sort.key) view.setSort(key)
              }}
              options={SORT_KEYS.map((k: SortKey) => ({ value: k, label: `Sort: ${SORT_LABEL[k]}` }))}
            />
          </Field>
        ) : null}
      </div>
      <p className={styles.count} role="status">
        Showing {shown} of {stations.length}
        {view.active ? (
          <Button variant="quiet" size="sm" icon="x" onClick={view.clear}>
            Clear filters
          </Button>
        ) : null}
      </p>
    </div>
  )
}
