import { useCallback, useEffect, useState } from 'react'
import { clearPersistedCache, queryClient, readPersistedCacheInfo, usePersistStatus, type PersistedCacheInfo } from '@/lib/query'
import { useLabSetting } from '@/lib/settings'
import { Button, Dialog, KeyValue, Meter, Plate, Tag, formatBytes, formatStamp } from '@/ui'
import { draftActions, useDrafts } from '@/features/compose/drafts/draft-store'
import styles from './cards.module.css'

interface Estimate {
  usage: number
  quota: number
}

type Confirm = 'drafts' | 'queries' | null

/** navigator.storage.estimate, read-only. Null where the browser has no such API. */
async function readEstimate(): Promise<Estimate | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.estimate !== 'function') return null
    const { usage, quota } = await navigator.storage.estimate()
    return usage === undefined || quota === undefined ? null : { usage, quota }
  } catch {
    return null
  }
}

/** Card 8: what this site keeps on the device, and two ways to empty it. */
export function StorageCard() {
  const persistOn = useLabSetting('persistQueryCache')
  const persistedNow = usePersistStatus((s) => s.enabled)
  const draftList = useDrafts()
  const drafts = draftList.length
  const [cache, setCache] = useState<PersistedCacheInfo | null | undefined>(undefined)
  const [estimate, setEstimate] = useState<Estimate | null | undefined>(undefined)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [done, setDone] = useState('')

  const refresh = useCallback(async () => {
    setCache(await readPersistedCacheInfo())
    setEstimate(await readEstimate())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const confirmed = async (): Promise<void> => {
    const which = confirm
    setConfirm(null)
    if (which === 'drafts') {
      draftList.forEach((d) => draftActions.remove(d.id))
      setDone('Local drafts cleared.')
    } else if (which === 'queries') {
      await clearPersistedCache()
      queryClient.removeQueries({ type: 'inactive' })
      setDone('Cached queries cleared. Screens fetch again as you open them.')
    }
    await refresh()
  }

  const ratio = estimate ? estimate.usage / estimate.quota : 0

  return (
    <Plate id="storage" index={8} title="Storage and data" actions={<Tag tone={persistOn ? 'ok' : 'neutral'}>Query persistence {persistOn ? 'on' : 'off'}</Tag>}>
      <div className={styles.stack}>
        <KeyValue
          dense
          items={[
            { label: 'Local drafts', value: `${drafts} stored` },
            { label: 'Persisted query cache', value: cache === undefined ? 'reading' : cache === null ? 'none on disk' : `${cache.queryCount} queries, ${formatBytes(cache.approxBytes)}` },
            { label: 'Cache written', value: cache ? formatStamp(cache.timestamp) : 'never', show: cache !== undefined },
            { label: 'Cache buster', value: cache?.buster ?? '', show: Boolean(cache) },
          ]}
        />
        {persistOn !== persistedNow ? <p className={styles.hint}>The persistence setting changed after this page loaded. It takes effect on the next reload.</p> : null}
        {!persistOn && cache ? <p className={styles.hint}>Persistence is off, so this copy is left over from when it was on and is not being used.</p> : null}
        {estimate ? (
          <Meter label="Storage used by this site" value={estimate.usage} max={estimate.quota} segments={30} tone={ratio > 0.8 ? 'warn' : 'ink'} valueText={`${formatBytes(estimate.usage)} of ${formatBytes(estimate.quota)}`} />
        ) : estimate === null ? (
          <p className={styles.hint}>This browser does not report a storage estimate.</p>
        ) : null}
        <div className={styles.rowCenter}>
          <Button variant="danger" icon="trash" disabled={drafts === 0} onClick={() => setConfirm('drafts')}>
            Clear local drafts
          </Button>
          <Button variant="danger" icon="trash" onClick={() => setConfirm('queries')}>
            Clear cached queries
          </Button>
          <Button variant="quiet" icon="refresh" onClick={() => void refresh()}>
            Re-read
          </Button>
        </div>
        <p className={styles.hint} role="status" aria-live="polite">
          {done}
        </p>
        <p className={styles.prose}>
          The estimate covers everything the origin holds: Cache Storage, IndexedDB and more, and it is deliberately blurred by the browser. Cache Storage itself is listed under Lab, Cache Storage.
        </p>
      </div>
      <Dialog
        open={confirm === 'drafts'}
        size="sm"
        onClose={() => setConfirm(null)}
        title={`Delete ${drafts} local ${drafts === 1 ? 'draft' : 'drafts'}?`}
        description="Drafts exist only on this device. There is no copy on the server to get them back from."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} data-autofocus>
              Keep them
            </Button>
            <Button variant="danger" icon="trash" onClick={() => void confirmed()}>
              Delete drafts
            </Button>
          </>
        }
      >
        <p>Anything waiting in the outbox is not a draft and is not touched.</p>
      </Dialog>
      <Dialog
        open={confirm === 'queries'}
        size="sm"
        onClose={() => setConfirm(null)}
        title="Clear cached queries?"
        description="Removes the stored copy in IndexedDB and every in-memory query that is not on screen."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} data-autofocus>
              Keep them
            </Button>
            <Button variant="danger" icon="trash" onClick={() => void confirmed()}>
              Clear cache
            </Button>
          </>
        }
      >
        <p>Nothing is lost that the server still has. Until the next fetch, offline screens may have less to show.</p>
      </Dialog>
    </Plate>
  )
}
