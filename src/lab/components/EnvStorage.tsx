import { useCallback, useEffect, useState } from 'react'
import { AppError } from '@/lib/errors/app-error'
import { toAppError } from '@/lib/errors/normalize'
import { readPermission, type PermissionReading } from '../observers/capabilities'
import { readStorage, requestPersist, type StorageReading } from '../observers/storage-info'
import { Button, EmptyState, ErrorState, KeyValue, Loader, Meter, Plate, StatusDot, Tag, TimeAgo, formatBytes, type KeyValueItem } from '@/ui'
import styles from './EnvStorage.module.css'

const GB = 1024 ** 3

/** formatBytes stops at MB; quotas are commonly tens of GB. */
const bytesText = (bytes: number): string => (bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : formatBytes(bytes))

const explain = (granted: boolean): string =>
  granted
    ? 'Granted. Under storage pressure the browser will now leave this origin alone.'
    : 'Denied, or not decided yet. Browsers choose for themselves: Chromium looks at engagement (installed, bookmarked, notifications allowed), Firefox asks the user, Safari grants it to apps on the home screen. A script can only ask.'

function permissionTag(reading: PermissionReading | null): ItemValue {
  if (!reading) return 'reading'
  if (reading.state === 'unknown') return <Tag title={reading.reason}>Not exposed</Tag>
  return <Tag tone={reading.state === 'granted' ? 'ok' : reading.state === 'denied' ? 'error' : 'info'}>{reading.state}</Tag>
}
type ItemValue = KeyValueItem['value']

/** navigator.storage: how much this origin uses, whether the browser promised not to evict it, and a way to ask. */
export function EnvStorage() {
  const [reading, setReading] = useState<StorageReading | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [permission, setPermission] = useState<PermissionReading | null>(null)
  const [asking, setAsking] = useState(false)
  const [outcome, setOutcome] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setReading(await readStorage())
      setError(null)
    } catch (err) {
      setError(toAppError(err, { source: 'lab:storage' }))
    }
    setPermission(await readPermission('persistent-storage'))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const ask = async (): Promise<void> => {
    setAsking(true)
    try {
      const granted = await requestPersist()
      setOutcome(explain(granted))
    } catch (err) {
      setOutcome(toAppError(err, { source: 'lab:storage-persist', apiCall: true }).userMessage)
    } finally {
      setAsking(false)
      await refresh()
    }
  }

  const ratio = reading?.usage != null && reading.quota ? reading.usage / reading.quota : null
  const details = reading?.details ? Object.entries(reading.details).sort(([, a], [, b]) => b - a) : []

  return (
    <Plate
      index="Nº 0004"
      title="Storage"
      aria-busy={reading === null && error === null}
      actions={
        <Button size="sm" icon="refresh" onClick={() => void refresh()}>
          Refresh
        </Button>
      }
    >
      <div className={styles.body}>
        {error ? <ErrorState error={error} onRetry={() => void refresh()} compact={reading !== null} /> : null}
        {reading === null && error === null ? (
          <div role="status">
            <Loader label="Reading storage" size="sm" />
          </div>
        ) : null}
        {reading && !reading.supported ? (
          <EmptyState compact icon="cache" title="Storage estimate unavailable">
            {reading.reason}
          </EmptyState>
        ) : null}
        {reading?.supported ? (
          <>
            <Meter
              label="Used of quota"
              value={reading.usage ?? 0}
              max={reading.quota ?? 1}
              tone={ratio !== null && ratio > 0.8 ? 'warn' : 'accent'}
              valueText={`${bytesText(reading.usage ?? 0)} of ${reading.quota === null ? 'unknown' : bytesText(reading.quota)}${ratio === null ? '' : ` (${ratio < 0.001 ? '<0.1' : (ratio * 100).toFixed(1)}%)`}`}
            />
            <KeyValue
              columns={2}
              dense
              items={[
                { label: 'Persisted', value: reading.persisted === null ? 'not reported' : <StatusDot tone={reading.persisted ? 'ok' : 'warn'} label={reading.persisted ? 'yes, exempt from eviction' : 'no, best effort'} /> },
                { label: 'Permission', value: permissionTag(permission) },
                { label: 'Read', value: <TimeAgo at={reading.readAt} /> },
              ]}
            />
            {details.length > 0 ? (
              <KeyValue dense items={details.map(([type, bytes]) => ({ label: type, value: bytesText(bytes) }))} />
            ) : (
              <p className={styles.hint}>This browser reports a total only. Chromium adds a per-type breakdown (caches, indexedDB, service worker registrations) in usageDetails.</p>
            )}
            <div className={styles.persist}>
              <Button icon="lock" loading={asking} onClick={() => void ask()}>
                Request persistent storage
              </Button>
              <p className={styles.result} role="status">
                {outcome}
              </p>
            </div>
            <p className={styles.hint}>
              Quota and usage are estimates: browsers round them on purpose so the numbers cannot fingerprint you, and opaque cached responses are padded. Without persistence, Cache Storage and IndexedDB can be evicted as a whole
              when the disk fills.
            </p>
          </>
        ) : null}
      </div>
    </Plate>
  )
}
