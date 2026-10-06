import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { SEVERITIES, type Severity, type StationList } from '@shared/contracts'
import type { ApiQuery } from '@/lib/queries'
import { Button, Checkbox, Field, IconButton, Input, Segmented, Select, type SegmentedOption, type SelectOption } from '@/ui'
import { countActiveFilters, type LogFilterValues } from '../filters'
import { useNarrow } from '../hooks/useNarrow'
import styles from './FilterBar.module.css'

/** Long enough that typing a word is one request, short enough that it still feels like it answers. */
export const SEARCH_DEBOUNCE_MS = 300

type SeverityChoice = Severity | 'all'
const SEVERITY_OPTIONS: Array<SegmentedOption<SeverityChoice>> = [
  { value: 'all', label: 'All' },
  ...SEVERITIES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
]

export interface FilterBarProps {
  values: LogFilterValues
  onChange: (change: Partial<LogFilterValues>, options?: { replace?: boolean }) => void
  onClear: () => void
  stations: ApiQuery<StationList>
}

function stationOptions(stations: ApiQuery<StationList>, selected: string | undefined): SelectOption[] {
  const listed = (stations.data?.items ?? []).map((s) => ({ value: s.code, label: `${s.code}  ${s.name}` }))
  // A station in the address that the list does not know (list failed, or a stale link) must still show as chosen.
  const known = selected !== undefined && listed.some((o) => o.value === selected)
  return [{ value: '', label: 'All stations' }, ...(selected !== undefined && !known ? [{ value: selected, label: selected }] : []), ...listed]
}

/** Every control writes to the address bar through `onChange`; nothing here keeps filter state except the text being typed. */
export function FilterBar({ values, onChange, onClear, stations }: FilterBarProps) {
  // Text being typed, not yet in the address. null = show what the address says.
  const [draft, setDraft] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const commit = (text: string): void => {
    clearTimeout(timer.current)
    onChange({ q: text }, { replace: true })
    setDraft(null)
  }
  const type = (text: string): void => {
    setDraft(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => commit(text), SEARCH_DEBOUNCE_MS)
  }
  const clearAll = (): void => {
    clearTimeout(timer.current)
    setDraft(null)
    onClear()
  }

  const options = useMemo(() => stationOptions(stations, values.station), [stations, values.station])
  const active = countActiveFilters(values)
  const stationsDown = stations.data === undefined && stations.isError
  const shown = draft ?? values.q
  const narrow = useNarrow()
  const hidden = active - (values.q.trim() ? 1 : 0)
  // On a phone the station, severity and toggles fold away unless one of them is doing something.
  const [foldOpen, setFoldOpen] = useState(hidden > 0)
  const foldId = useId()

  const secondary = (
    <>
      <Field
        label="Station"
        className={styles.station}
        hint={
          stationsDown ? (
            <>
              Station list unavailable.{' '}
              <button type="button" className={styles.inlineRetry} aria-label="Retry loading the station list" onClick={() => void stations.refetch()}>
                Retry
              </button>
            </>
          ) : undefined
        }
      >
        <Select options={options} value={values.station ?? ''} disabled={stations.data === undefined && values.station === undefined} onChange={(e) => onChange({ station: e.target.value || undefined })} />
      </Field>
      <Segmented
        className={styles.severity}
        label="Severity"
        showLabel
        size="sm"
        options={SEVERITY_OPTIONS}
        value={values.severity ?? 'all'}
        onChange={(v) => onChange({ severity: v === 'all' ? undefined : v })}
      />
      <div className={styles.toggles}>
        <Checkbox label="Unread only" checked={values.unread} onChange={(e) => onChange({ unread: e.target.checked })} />
        <Checkbox label="Starred only" checked={values.starred} onChange={(e) => onChange({ starred: e.target.checked })} />
      </div>
    </>
  )

  return (
    <form
      className={styles.bar}
      role="search"
      aria-label="Filter the log"
      onSubmit={(e) => {
        e.preventDefault()
        commit(draft ?? values.q)
      }}
    >
      <Field label="Search" className={styles.search}>
        <Input
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          leading="search"
          placeholder="Title, text, tag or station"
          value={shown}
          onChange={(e) => type(e.target.value)}
          trailing={shown ? <IconButton icon="x" label="Clear search" size="sm" variant="quiet" onClick={() => commit('')} /> : undefined}
        />
      </Field>
      {narrow ? (
        <div className={styles.fold}>
          <Button size="sm" variant="quiet" icon={foldOpen ? 'minus' : 'plus'} aria-expanded={foldOpen} aria-controls={foldId} onClick={() => setFoldOpen(!foldOpen)}>
            More filters{hidden > 0 ? ` (${hidden} on)` : ''}
          </Button>
          <div id={foldId} className={styles.foldBody} hidden={!foldOpen}>
            {secondary}
          </div>
        </div>
      ) : (
        secondary
      )}
      {active > 0 ? (
        <Button className={styles.clear} size="sm" variant="quiet" icon="x" onClick={clearAll}>
          Clear filters ({active})
        </Button>
      ) : null}
    </form>
  )
}
