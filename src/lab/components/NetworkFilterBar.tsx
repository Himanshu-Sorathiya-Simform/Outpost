import { Button, Checkbox, Field, Input, Select, Switch } from '@/ui'
import { CLASS_NAME, NET_CLASSES, type NetClass } from './NetworkJoin'
import { filtersActive, METHODS, NO_FILTERS, STATUS_CLASSES, type NetFilters, type StatusClass } from './NetworkStats'
import type { Tail } from './useNetworkRows'
import styles from './NetworkFilterBar.module.css'

export interface NetworkFilterBarProps {
  filters: NetFilters
  onChange: (next: NetFilters) => void
  tail: Tail
  shown: number
  total: number
}

const CLASS_OPTIONS = [{ value: 'all', label: 'All classes' }, ...NET_CLASSES.map((c) => ({ value: c, label: CLASS_NAME[c] }))]
const STATUS_OPTIONS = [{ value: 'all', label: 'Any status' }, ...STATUS_CLASSES.map((s) => ({ value: s, label: s === 'failed' ? 'Failed (no response)' : s }))]
const METHOD_OPTIONS = [{ value: 'all', label: 'Any method' }, ...METHODS.map((m) => ({ value: m, label: m }))]

/** Filters for the joined ledger, and the live-tail switch. "Paused, N new" is announced politely and resumes on click. */
export function NetworkFilterBar({ filters, onChange, tail, shown, total }: NetworkFilterBarProps) {
  const set = <K extends keyof NetFilters>(key: K, value: NetFilters[K]): void => onChange({ ...filters, [key]: value })
  return (
    <div className={styles.bar}>
      <div className={styles.fields}>
        <Field label="Class" className={styles.field}>
          <Select value={filters.cls} options={CLASS_OPTIONS} onChange={(e) => set('cls', e.target.value as NetClass | 'all')} />
        </Field>
        <Field label="Status" className={styles.field}>
          <Select value={filters.status} options={STATUS_OPTIONS} onChange={(e) => set('status', e.target.value as StatusClass | 'all')} />
        </Field>
        <Field label="Method" className={styles.field}>
          <Select value={filters.method} options={METHOD_OPTIONS} onChange={(e) => set('method', e.target.value)} />
        </Field>
        <Field label="Path contains" className={styles.grow}>
          <Input type="search" leading="search" value={filters.text} placeholder="/api/dispatches" autoComplete="off" spellCheck={false} onChange={(e) => set('text', e.target.value)} />
        </Field>
      </div>
      <div className={styles.toggles}>
        <Checkbox label="Only anomalies" description="Client and server disagree, or a fault was injected" checked={filters.anomaliesOnly} onChange={(e) => set('anomaliesOnly', e.target.checked)} />
        <Checkbox label="Hide probes" description="Ping, version checks, lab calls" checked={filters.hideProbes} onChange={(e) => set('hideProbes', e.target.checked)} />
        <Switch label="Live tail" checked={tail.live} onChange={(on) => (on ? tail.resume() : tail.pause())} />
        <div className={styles.status} role="status" aria-live="polite">
          {tail.live ? null : (
            <Button size="sm" variant="primary" icon="play" onClick={tail.resume}>
              Paused, {tail.pendingCount} new
            </Button>
          )}
        </div>
      </div>
      <p className={styles.count}>
        <span aria-live="polite">
          {shown === total ? `${total} rows` : `${shown} of ${total} rows`}
        </span>
        {filtersActive(filters) ? (
          <Button size="sm" variant="quiet" icon="x" onClick={() => onChange(NO_FILTERS)}>
            Clear filters
          </Button>
        ) : null}
      </p>
    </div>
  )
}
