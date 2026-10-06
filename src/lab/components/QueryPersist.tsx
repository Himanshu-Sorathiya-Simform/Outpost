import { useState } from 'react'
import { clearPersistedCache, corruptPersistedCache, resolveBuster, useLabSetting, usePersistStatus } from '@/lib'
import { Button, Dialog, EmptyState, KeyValue, Plate, Skeleton, Tag, TimeAgo, formatBytes, formatStamp } from '@/ui'
import { usePersistedInfo } from './QueryPersistInfo'
import styles from './QueryPersist.module.css'

/** The IndexedDB copy of the query cache: whether it is on, what it holds, whether the buster would keep it, and two ways to break it on purpose. */
export function QueryPersist() {
  const status = usePersistStatus()
  const mode = useLabSetting('rqBuster')
  const { state, refresh } = usePersistedInfo()
  const [confirmCorrupt, setConfirmCorrupt] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [corrupted, setCorrupted] = useState(false)

  const expected = resolveBuster(mode)
  const run = async (task: () => Promise<void>, message: string): Promise<void> => {
    await task()
    await refresh()
    setNote(message)
  }

  const info = state.phase === 'ready' ? state.info : null
  const verdict = info === null ? null : info.buster === expected ? 'matches' : 'differs'

  return (
    <Plate
      index={4}
      title="Persistence"
      actions={
        <Button size="sm" icon="refresh" onClick={() => void refresh()}>
          Read again
        </Button>
      }
    >
      <div className={styles.body}>
        <KeyValue
          dense
          columns={2}
          items={[
            { label: 'Persistence at load', value: status.enabled ? 'on' : 'off' },
            { label: 'Restored at load', value: status.rejected ? 'record rejected and deleted: restored 0 queries' : status.restoredAt ? `${status.restoredQueries} queries, ${formatStamp(status.restoredAt)}` : status.enabled ? 'nothing to restore' : 'not attempted' },
            { label: 'Last written', value: status.lastPersistAt ? <TimeAgo at={status.lastPersistAt} /> : 'not since load' },
            { label: 'Buster the setting would use', value: expected === '' ? '(empty: never discard)' : expected },
          ]}
        />

        {status.lastError ? (
          <p className={styles.fault} role="status">
            <Tag tone="error" icon="warning">persister error</Tag>
            <span>{status.lastError}</span>
          </p>
        ) : null}

        <section aria-labelledby="persist-disk" className={styles.disk}>
          <h3 id="persist-disk" className={styles.label}>
            On disk now
          </h3>
          {state.phase === 'loading' ? (
            <div aria-busy="true" aria-label="Reading IndexedDB">
              <Skeleton lines={3} />
            </div>
          ) : info === null ? (
            <EmptyState compact title={corrupted ? 'Unreadable record' : 'Nothing stored'} icon="cache">
              {corrupted
                ? 'The record is there but is not a valid cache, which is what you made it. A reload should reject and delete it.'
                : status.enabled
                ? 'Persistence is on but nothing has been written yet, or the record was unreadable and was deleted. It is written a second after the cache changes.'
                : 'Persistence is off, so nothing writes here. Switch it on in the settings above, reload, then use the app for a moment.'}
            </EmptyState>
          ) : (
            <KeyValue
              dense
              items={[
                { label: 'Queries', value: info.queryCount },
                { label: 'Size', value: formatBytes(info.approxBytes) },
                { label: 'Written', value: <TimeAgo at={info.timestamp} /> },
                { label: 'Buster stored', value: info.buster === '' ? '(empty)' : info.buster },
                {
                  label: 'Against the setting',
                  value: verdict === 'matches' ? 'matches: restored on reload' : 'differs: the whole cache is discarded on reload',
                },
              ]}
            />
          )}
        </section>

        <div className={styles.actions}>
          <Button size="sm" variant="danger" icon="trash" disabled={info === null && !corrupted} onClick={() => {
              setCorrupted(false)
              void run(clearPersistedCache, 'Persisted cache cleared. The in-memory cache is untouched, and the persister writes a new record a second after it next changes.')
            }}>
            Clear persisted cache
          </Button>
          <Button size="sm" variant="danger" icon="bug" disabled={!status.enabled} onClick={() => setConfirmCorrupt(true)}>
            Corrupt persisted cache
          </Button>
          <Button size="sm" icon="refresh" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
        {status.enabled ? null : <p className={styles.hint}>Corrupting needs persistence on at load: nothing reads the record otherwise, so there would be no recovery to watch.</p>}

        <p aria-live="polite" className={styles.note}>
          {note}
        </p>
      </div>

      <Dialog
        open={confirmCorrupt}
        onClose={() => setConfirmCorrupt(false)}
        title="Overwrite the saved cache with garbage?"
        footer={
          <>
            <Button data-autofocus onClick={() => setConfirmCorrupt(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="bug"
              onClick={() => {
                setConfirmCorrupt(false)
                setCorrupted(true)
                void run(corruptPersistedCache, 'Corrupted. Reload now: the restore should reject the record, delete it, and report schema-mismatch to the error centre.')
              }}
            >
              Corrupt it
            </Button>
          </>
        }
      >
        <p className={styles.confirm}>
          The record in IndexedDB is replaced with a value that has the wrong shape. Nothing in memory changes. On the next load the persister is expected to notice, delete it and carry on with an empty cache. Reload promptly: the live persister rewrites a good record a second after the cache next changes.
        </p>
      </Dialog>
    </Plate>
  )
}
