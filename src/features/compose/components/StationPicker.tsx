import type { Station } from '@shared/contracts'
import { useLabSetting } from '@/lib'
import { useStations } from '@/lib/queries'
import { ErrorState, Input, Loader, ProvenanceChip, Select, TimeAgo, type SelectOption } from '@/ui'
import { findStation } from '../form/validate'
import { Notice } from './Notice'
import styles from './StationPicker.module.css'

export interface StationPickerProps {
  /** Receives the select, or the text box in fallback mode, so the form can focus it on an error. */
  controlRef: (el: HTMLElement | null) => void
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}

const CACHE_SOURCES: ReadonlySet<string> = new Set(['sw-cache', 'http-cache', 'sw-fallback'])
/** A copy that came from a cache but was made this recently is as good as live; older than this, say so. */
const STORED_COPY_AGE_MS = 15_000

function optionsOf(items: readonly Station[]): SelectOption[] {
  const sorted = [...items].sort((a, b) => a.code.localeCompare(b.code))
  return [
    { value: '', label: 'Choose a station' },
    ...sorted.map((s) => ({ value: s.id, label: `${s.code}  ${s.name}${s.status === 'online' ? '' : `  (${s.status})`}` })),
  ]
}

/**
 * The station field. Choosing from the list is the normal path (the list is stale-while-revalidate data, and the
 * picker says so when it is a stored copy). If the list cannot load at all, it becomes a typed station code
 * that is checked for shape, so the form never depends on the relay to be usable.
 */
export function StationPicker({ value, onChange, invalid, controlRef }: StationPickerProps) {
  const query = useStations()
  const showProvenance = useLabSetting('showProvenance')
  const items = query.data?.items
  const chosen = findStation(items, value)

  if (!items) {
    if (query.isPending) {
      return (
        <div className={styles.stack}>
          <Select ref={controlRef} disabled aria-busy="true" options={[{ value: '', label: 'Loading stations' }]} value="" onChange={() => undefined} />
          <Loader label="Loading the station list" size="sm" />
        </div>
      )
    }
    return (
      <div className={styles.stack}>
        {query.error ? <ErrorState compact error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
        <Input
          ref={controlRef}
          value={value}
          invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          placeholder="KRN-07"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={24}
        />
        <Notice tone="quiet">The station list could not be loaded, so type the code. It is checked for shape here and by the relay when it is sent.</Notice>
      </div>
    )
  }

  const storedCopy =
    query.meta !== undefined && CACHE_SOURCES.has(query.meta.source) && (query.meta.source !== 'http-cache' || (query.meta.dataAgeMs ?? 0) > STORED_COPY_AGE_MS)
  const refreshFailed = query.isError
  const copyTime = query.meta ? (query.meta.swCachedAt ?? query.meta.servedAt ?? query.meta.fetchedAt) : null

  return (
    <div className={styles.stack}>
      <Select ref={controlRef} value={chosen?.id ?? ''} invalid={invalid} onChange={(e) => onChange(e.target.value)} options={optionsOf(items)} />
      {chosen && chosen.status !== 'online' ? (
        <p className={styles.remark}>
          {chosen.code} is {chosen.status}. You can still file from here; it will be logged against the station.
        </p>
      ) : null}
      {(storedCopy || refreshFailed) && copyTime ? (
        <Notice tone={refreshFailed ? 'warn' : 'quiet'}>
          {refreshFailed ? 'Could not refresh the station list. ' : ''}Showing the stored copy from <TimeAgo at={copyTime} />.
        </Notice>
      ) : null}
      {showProvenance ? <ProvenanceChip meta={query.meta} /> : null}
    </div>
  )
}
