import { BENCH_KEYS } from '@shared/contracts'
import { IconButton, StatusDot, type StatusTone } from '@/ui'
import { usePrecached, type Precached } from './BenchCacheReaders'
import styles from './BenchPrecached.module.css'

const LOOK: Record<Precached, { tone: StatusTone; text: string }> = {
  yes: { tone: 'ok', text: 'precached' },
  no: { tone: 'idle', text: 'not stored' },
  unknown: { tone: 'idle', text: 'unknown' },
}

/** Live answer to "would cache-only find this key?", straight from caches.match. A miss is normal, not a fault. */
export function BenchPrecached({ selected }: { selected: string }) {
  const { state, refresh } = usePrecached(BENCH_KEYS)
  const current = state[selected]
  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <p className={styles.title}>Precached?</p>
        <IconButton icon="refresh" size="sm" variant="quiet" label="Check Cache Storage again" onClick={refresh} />
      </div>
      <ul className={styles.list} aria-label="Precached keys for cache only">
        {BENCH_KEYS.map((key) => {
          const look = LOOK[state[key] ?? 'unknown']
          return (
            <li key={key} className={key === selected ? styles.selected : undefined}>
              <span className={styles.key}>{key}</span>
              <StatusDot tone={look.tone} label={look.text} size="sm" />
            </li>
          )
        })}
      </ul>
      <p className={styles.note} role="status">
        {current === 'unknown'
          ? 'Cache Storage cannot be read here, so whether this key is precached is unknown.'
          : current === 'no'
            ? `A fetch of ${selected} will miss. That is the expected cache-miss error: the worker has nothing stored and must not go to the network.`
            : current === 'yes'
              ? `${selected} is stored. A fetch will be answered from the cache, whatever the server holds now.`
              : 'Checking Cache Storage.'}
      </p>
    </div>
  )
}
