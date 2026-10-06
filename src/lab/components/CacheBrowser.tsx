import { useMemo, useState } from 'react'
import { groupCaches } from '../observers/cache-names'
import { deleteAllCaches } from '../observers/cache-store'
import type { CacheListState } from '../observers/cache-explorer'
import { toAppError } from '@/lib/errors/normalize'
import { Button, Dialog, EmptyState, ErrorState, Field, Input, Plate, Skeleton, Switch, TimeAgo } from '@/ui'
import { CacheCard } from './CacheCard'
import styles from './CacheBrowser.module.css'

interface Props {
  list: CacheListState
  auto: boolean
  onAutoChange(auto: boolean): void
}

/** Every cache bucket, grouped by name prefix so old versions sit next to the current one. */
export function CacheBrowser({ list, auto, onAutoChange }: Props) {
  const [filter, setFilter] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const groups = useMemo(() => groupCaches(list.summaries.map((s) => s.name)), [list.summaries])
  const summaries = useMemo(() => new Map(list.summaries.map((s) => [s.name, s])), [list.summaries])
  const entries = list.summaries.reduce((n, s) => n + (s.count ?? 0), 0)

  const wipe = async (): Promise<void> => {
    setConfirm(false)
    try {
      await deleteAllCaches()
      setFailure(null)
    } catch (err) {
      setFailure(toAppError(err, { source: 'lab:cache-delete-all' }).message)
    }
    list.refresh()
  }

  return (
    <Plate
      index="Nº 0001"
      title="Buckets"
      aria-busy={list.phase === 'loading'}
      actions={
        <>
          <Switch checked={auto} onChange={onAutoChange} label="Refresh every 2 s" />
          <Button size="sm" icon="refresh" loading={list.refreshing} onClick={list.refresh}>
            Refresh
          </Button>
          <Button size="sm" variant="danger" icon="trash" disabled={list.summaries.length === 0} onClick={() => setConfirm(true)}>
            Delete all
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        {list.phase === 'loading' ? (
          <div role="status" aria-label="Listing caches">
            <Skeleton variant="block" height={72} />
          </div>
        ) : null}
        {list.error ? <ErrorState error={list.error} onRetry={list.refresh} retrying={list.refreshing} compact={list.phase === 'ready'} /> : null}
        {failure ? <ErrorState error={toAppError(new Error(failure), { source: 'lab:cache-delete-all' })} compact /> : null}
        {list.phase === 'ready' ? (
          <>
            <div className={styles.tools}>
              <Field label="Filter entries by URL" className={styles.search}>
                <Input leading="search" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="/api/handbook" spellCheck={false} />
              </Field>
              <p className={styles.status} role="status">
                {list.summaries.length} {list.summaries.length === 1 ? 'cache' : 'caches'}, {entries} entries.{list.readAt ? <> Read <TimeAgo at={list.readAt} />.</> : null}
                {list.error ? ' Showing the last good read.' : ''}
              </p>
            </div>
            {list.summaries.length === 0 ? (
              <EmptyState icon="cache" title="Cache Storage is empty">
                No cache exists for this origin. Nothing in the page writes to Cache Storage; only a service worker you write (or code that calls caches.open) creates buckets. Until then every request goes to the network.
              </EmptyState>
            ) : (
              groups.map((g) => (
                <section key={g.group} className={styles.group} aria-label={`Caches named ${g.prefix}`}>
                  <h3 className={styles.groupHead}>
                    {g.prefix}
                    <span className={styles.groupMeta}>
                      {g.members.length} {g.members.length === 1 ? 'bucket' : 'buckets'}
                      {g.newest !== null ? `, newest v${g.newest}` : ', unversioned'}
                    </span>
                  </h3>
                  <ul className={styles.cards}>
                    {g.members.map((m) => (
                      <CacheCard key={m.name} member={m} summary={summaries.get(m.name)} newest={g.newest} tick={list.tick} filter={filter} onChanged={list.refresh} />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        ) : null}
      </div>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        size="sm"
        title="Delete every cache?"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="danger" data-autofocus onClick={() => void wipe()}>
              Delete all caches
            </Button>
          </>
        }
      >
        <p>
          All {list.summaries.length} caches and {entries} entries for this origin go, including ones your worker did not create. The next offline visit has nothing stored to show.
        </p>
      </Dialog>
    </Plate>
  )
}
