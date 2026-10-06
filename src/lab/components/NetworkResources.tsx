import { useMemo, useState } from 'react'
import { useResourceLog, type ResourceCategory, type ResourceEntry } from '@/lib'
import { Button, EmptyState, formatBytes, formatDuration, Segmented, SourceGlyph } from '@/ui'
import { TimeCell } from './NetworkCells'
import { NetworkGrid, type GridColumn } from './NetworkGrid'
import styles from './NetworkResources.module.css'

type Quick = 'all' | 'scripts' | 'fonts' | 'images' | 'fetch'

const QUICK: Array<{ value: Quick; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'scripts', label: 'Scripts and chunks' },
  { value: 'fonts', label: 'Fonts' },
  { value: 'images', label: 'Images' },
  { value: 'fetch', label: 'Fetch' },
]
const MATCH: Record<Exclude<Quick, 'all'>, ReadonlySet<ResourceCategory>> = {
  scripts: new Set<ResourceCategory>(['script']),
  fonts: new Set<ResourceCategory>(['font']),
  images: new Set<ResourceCategory>(['image']),
  fetch: new Set<ResourceCategory>(['fetch']),
}

export type ServedFrom = 'network' | 'revalidated' | 'cache' | 'unknown'

/**
 * Where the bytes came from, as far as Resource Timing will say. transferSize 0 with a body means nothing crossed the
 * wire. Chromium adds deliveryType "cache" for that, but it does not tell the HTTP cache from a service worker.
 * A cross-origin entry without Timing-Allow-Origin reports zeros for everything, which is "unknown", not "cache".
 */
export function servedFrom(e: Pick<ResourceEntry, 'transferSize' | 'encodedBodySize' | 'deliveryType' | 'responseStatus'>): ServedFrom {
  if (e.deliveryType === 'cache') return 'cache'
  if (e.transferSize === 0 && e.encodedBodySize > 0) return 'cache'
  if (e.transferSize === 0 && e.encodedBodySize === 0) return 'unknown'
  if (e.encodedBodySize > 0 && e.transferSize < e.encodedBodySize) return 'revalidated'
  return 'network'
}

const SERVED_TEXT: Record<ServedFrom, string> = {
  network: 'Network',
  revalidated: 'Revalidated (304)',
  cache: 'Cache (HTTP or worker)',
  unknown: 'Unknown (sizes hidden)',
}

const COLUMNS: readonly GridColumn<ResourceEntry>[] = [
  { id: 'time', header: 'Started', width: '6.75rem', render: (e) => <TimeCell at={e.at} /> },
  { id: 'initiator', header: 'Initiator', width: '5.5rem', narrow: 'hide', render: (e) => e.initiatorType },
  { id: 'path', header: 'Resource', width: 'minmax(14rem, 1fr)', narrow: 'wide', render: (e) => <span title={e.name}>{e.path}</span> },
  { id: 'size', header: 'Transfer', width: '5.5rem', numeric: true, render: (e) => (e.transferSize === 0 ? '0 B' : formatBytes(e.transferSize)) },
  { id: 'delivery', header: 'Delivery', width: '5rem', narrow: 'hide', render: (e) => e.deliveryType || '-' },
  { id: 'proto', header: 'Protocol', width: '4.5rem', narrow: 'hide', render: (e) => e.nextHopProtocol || '-' },
  { id: 'dur', header: 'Took', width: '5rem', numeric: true, render: (e) => formatDuration(e.duration) },
  {
    id: 'served',
    header: 'Served from',
    width: '14rem',
    render: (e) => {
      const from = servedFrom(e)
      return (
        <span className={styles.served}>
          <SourceGlyph source={from === 'cache' ? 'http-cache' : from === 'unknown' ? 'unknown' : 'network'} />
          {SERVED_TEXT[from]}
        </span>
      )
    },
  },
]

/** Everything the page loaded, not only apiFetch: chunks, fonts, images, media. The one place a lazy route's JS shows up. */
export function NetworkResources() {
  const entries = useResourceLog((s) => s.entries)
  const clear = useResourceLog((s) => s.clear)
  const [quick, setQuick] = useState<Quick>('all')
  const rows = useMemo(() => (quick === 'all' ? entries : entries.filter((e) => MATCH[quick].has(e.category))), [entries, quick])
  const counts = useMemo(() => {
    const tally = { network: 0, revalidated: 0, cache: 0, unknown: 0 }
    for (const e of rows) tally[servedFrom(e)] += 1
    return tally
  }, [rows])

  return (
    <div className={styles.stack}>
      <div className={styles.head}>
        <Segmented<Quick> label="Resource type" options={QUICK} value={quick} onChange={setQuick} size="sm" />
        <Button icon="trash" variant="danger" disabled={entries.length === 0} onClick={clear}>
          Clear resources
        </Button>
      </div>
      <p className={styles.tally} aria-live="polite">
        {rows.length} shown: {counts.network} from the network, {counts.revalidated} revalidated, {counts.cache} from a cache, {counts.unknown} unknown.
      </p>
      {rows.length === 0 ? (
        <EmptyState compact icon="download" title={entries.length === 0 ? 'No resource timings' : 'No resource of that type'}>
          Open a lazy route or reload the page, and the scripts, fonts and images it pulls in are logged here, whether or not apiFetch was involved.
        </EmptyState>
      ) : (
        <NetworkGrid rows={rows} columns={COLUMNS} rowKey={(e) => String(e.id)} label="Resource timings, newest first" minWidth="62rem" />
      )}
    </div>
  )
}
