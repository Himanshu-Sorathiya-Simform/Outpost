import { useState } from 'react'
import { Button, EmptyState, ErrorState, LoadMore, Loader, Plate, ProvenanceChip, Skeleton } from '@/ui'
import type { ResponseSource } from '@/lib/api/types'
import { notify } from '@/lib/notify'
import { fault, meta } from '../fixtures'
import { Section, Specimen } from '../Section'
import k from '../Kitchen.module.css'

const SOURCES: ResponseSource[] = ['network', 'sw-cache', 'sw-network', 'sw-fallback', 'http-cache', 'unknown']

export function Feedback() {
  const [loading, setLoading] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const retry = (): void => {
    setRetrying(true)
    window.setTimeout(() => setRetrying(false), 1600)
  }
  const fetchMore = (): void => {
    setLoading(true)
    window.setTimeout(() => setLoading(false), 1600)
  }
  return (
    <Section id="feedback" no={4} title="Feedback" lede="Every async view has four designed states plus a fifth for this app: served from somewhere that is not the network.">
      <Plate title="Provenance" index="Fig. 10" actions={<span className="label">Shape plus label, never colour alone</span>}>
        <div className={k.stack}>
          <div className={k.row}>
            {SOURCES.map((s) => (
              <ProvenanceChip key={s} meta={meta(s, s === 'unknown' ? { dataAgeMs: null, servedAt: null } : {})} />
            ))}
            <ProvenanceChip meta={undefined} />
          </div>
          <div className={k.row}>
            {SOURCES.map((s) => (
              <ProvenanceChip key={s} meta={meta(s)} compact />
            ))}
          </div>
          <p className="muted">Open any chip for every field of the response. Stale data (older than a minute and not straight from the network) is flagged in the chip itself.</p>
        </div>
      </Plate>

      <div className={k.grid3}>
        <Specimen label="Loader">
          <Loader />
          <Loader size="sm" label="Fetching" />
          <Loader size="lg" label="Waiting for relay" />
          <Loader label={null} />
        </Specimen>
        <Specimen label="Skeleton">
          <Skeleton variant="title" width="70%" />
          <Skeleton lines={3} />
          <Skeleton variant="block" height="4.5rem" />
        </Specimen>
        <Specimen label="EmptyState">
          <EmptyState title="Nothing filed" icon="inbox" compact action={<Button size="sm">Clear filters</Button>}>
            No dispatch matches KRN-07 with urgent severity.
          </EmptyState>
        </Specimen>
      </div>

      <div className={k.grid2}>
        <Specimen label="ErrorState / transient, retryable">
          <ErrorState error={fault('network', 'TypeError: Failed to fetch', { url: '/api/dispatches?limit=12', method: 'GET', requestId: 'rq-8f31c2', chaos: 'Flaky 30%', source: 'route:/log', attempt: 3, headers: { accept: 'application/json' } })} onRetry={retry} retrying={retrying} detailOpen />
        </Specimen>
        <Specimen label="ErrorState / fault">
          <ErrorState error={fault('schema-mismatch', 'dispatch.items[0].severity: expected one of routine|notice|urgent|critical', { url: '/api/dispatches', method: 'GET', status: 200, source: 'query:dispatches' })} />
        </Specimen>
        <Specimen label="ErrorState / rate limited">
          <ErrorState error={fault('rate-limited', 'Too many requests', { url: '/api/dispatches', method: 'POST', status: 429, retryAfterSec: 12 })} onRetry={retry} />
        </Specimen>
        <Specimen label="ErrorState / not wired up (quiet)">
          <ErrorState error={fault('not-implemented', 'PWA feature "badge.set" is not implemented yet', { source: 'seam:badge.set' })} />
        </Specimen>
        <Specimen label="ErrorState / compact">
          <ErrorState compact error={fault('timeout', 'Request exceeded 10000 ms', { url: '/api/signal' })} onRetry={retry} />
        </Specimen>
        <Specimen label="Toasts">
          <div className={k.row}>
            <Button onClick={() => notify({ tone: 'info', title: 'Update ready', message: 'A new version is waiting. Reload to use it.', action: { label: 'Reload', run: () => undefined }, key: 'sw-update' })}>Info</Button>
            <Button onClick={() => notify({ tone: 'ok', title: 'Dispatch filed', message: 'Accepted by the relay as dp-000149.' })}>Done</Button>
            <Button onClick={() => notify({ tone: 'warn', title: 'Working offline', message: 'Showing data stored 4 minutes ago.' })}>Warning</Button>
            <Button variant="danger" onClick={() => notify({ tone: 'error', title: 'Could not file dispatch', message: 'The relay dropped the connection. Kept in drafts.' })}>
              Fault
            </Button>
            <Button variant="quiet" onClick={() => notify({ title: 'Sticky', message: 'Stays until dismissed.', durationMs: 0 })}>
              Sticky
            </Button>
          </div>
          <p className="muted">Timers stop while a toast is hovered or focused. Esc dismisses the focused one.</p>
        </Specimen>
      </div>

      <Plate title="Load more" index="Fig. 11">
        <div className={k.stack}>
          <LoadMore loaded={12} total={148} hasMore loading={loading} onLoadMore={fetchMore} noun="dispatches" />
          <LoadMore loaded={148} total={148} hasMore={false} loading={false} onLoadMore={fetchMore} noun="dispatches" />
          <LoadMore loaded={24} total={148} hasMore loading={false} onLoadMore={fetchMore} noun="dispatches" error={fault('network', 'Failed to fetch', { url: '/api/dispatches?cursor=MjQ' })} />
        </div>
      </Plate>
    </Section>
  )
}
