import { useState } from 'react'
import { queryClient } from '@/lib'
import { Button, EmptyState, Input, Plate, Segmented, Stat, StatGroup, formatBytes } from '@/ui'
import { QUERY_ACTIONS, runQueryAction, type QueryAction } from './QueryActions'
import { QueryDetail } from './QueryDetail'
import { describeQuery, matchesPrefix, matchesState, useCacheTick, type QueryRowData, type QueryState } from './QueryModel'
import { QueryTable } from './QueryTable'
import styles from './QueryCache.module.css'

const STATES: Array<{ value: QueryState; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'fetching', label: 'Fetching' },
  { value: 'fresh', label: 'Fresh' },
  { value: 'stale', label: 'Stale' },
  { value: 'error', label: 'Error' },
  { value: 'inactive', label: 'Unobserved' },
  { value: 'paused', label: 'Paused' },
]

const cache = queryClient.getQueryCache()
const subscribe = (listener: () => void): (() => void) => cache.subscribe(listener)

/** The live query cache. Redraws at most four times a second, so a feed that streams does not make the page flicker. */
export function QueryCache() {
  // The cache is a mutable store; a throttled counter inside the hook is what makes React read it again.
  useCacheTick(subscribe)
  const [prefix, setPrefix] = useState('')
  const [state, setState] = useState<QueryState>('all')
  const [inspected, setInspected] = useState<string | null>(null)
  const [said, setSaid] = useState('')

  const all = cache.getAll().map(describeQuery)
  const rows = all.filter((r) => matchesPrefix(r.keyText, prefix) && matchesState(r, state))

  const fetching = all.filter((r) => r.fetchStatus === 'fetching').length
  const stale = all.filter((r) => r.status === 'success' && r.stale).length
  const bytes = all.reduce((sum, r) => sum + (r.bytes ?? 0), 0)
  const filtered = prefix.trim() !== '' || state !== 'all'

  const clearFilters = (): void => {
    setPrefix('')
    setState('all')
  }

  const act = (action: QueryAction, row: QueryRowData): void => {
    runQueryAction(action, row)
    const info = QUERY_ACTIONS.find((a) => a.action === action)
    setSaid(`${info?.label ?? action}: ${row.keyText}`)
  }

  return (
    <Plate index={1} title="Query cache" actions={<span className={styles.rate}>redraws at most 4 times a second</span>}>
      <div className={styles.body}>
        <StatGroup>
          <Stat label="Entries" value={all.length} note={filtered ? `${rows.length} shown` : 'in memory'} />
          <Stat label="Fetching" value={fetching} tone={fetching > 0 ? 'accent' : 'default'} note="requests in flight" />
          <Stat label="Stale" value={stale} tone={stale > 0 ? 'warn' : 'default'} note="would refetch on next use" />
          <Stat label="Held" value={formatBytes(bytes)} note="JSON size of all values" />
        </StatGroup>

        <div className={styles.filters}>
          <div className={styles.search}>
            <label htmlFor="query-prefix" className={styles.label}>
              Key starts with
            </label>
            <Input id="query-prefix" leading="search" value={prefix} placeholder="dispatches / feed" spellCheck={false} autoComplete="off" onChange={(e) => setPrefix(e.target.value)} />
          </div>
          <Segmented size="sm" label="State" showLabel options={STATES} value={state} onChange={setState} />
        </div>

        <p className="sr-only" aria-live="polite">
          {said}
        </p>

        {all.length === 0 ? (
          <EmptyState title="The cache is empty" icon="cache">
            No query has run since this page loaded, or every entry has been removed. Open the log or the stations page and the entries appear here.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title="No entry matches" icon="filter" action={<Button size="sm" onClick={clearFilters}>Clear filters</Button>}>
            {all.length} {all.length === 1 ? 'entry is' : 'entries are'} in the cache, none with a key starting <code>{prefix.trim() || '(any)'}</code> in the state {state}.
          </EmptyState>
        ) : (
          <QueryTable rows={rows} selected={inspected} onInspect={setInspected} onAction={act} />
        )}
      </div>
      <QueryDetail query={inspected ? cache.get(inspected) : undefined} open={inspected !== null} onClose={() => setInspected(null)} onAction={act} />
    </Plate>
  )
}
