import { useEffect, useRef, useState } from 'react'
import { toAppError } from '@/lib/errors/normalize'
import { supersededNote, type CacheGroupMember } from '../observers/cache-names'
import { deleteCache, measureCache, MEASURE_CAP, type CacheSummary, type Measurement } from '../observers/cache-store'
import { Button, Dialog, ErrorState, Icon, Meter, Tag, formatBytes } from '@/ui'
import { CacheEntries } from './CacheEntries'
import styles from './CacheCard.module.css'

interface Props {
  member: CacheGroupMember
  summary: CacheSummary | undefined
  newest: number | null
  tick: number
  filter: string
  onChanged(): void
}

type Progress = { state: 'idle' } | { state: 'running'; done: number; total: number } | { state: 'done'; result: Measurement } | { state: 'failed'; message: string }

function measurementText(m: Measurement): string {
  const parts = [`${formatBytes(m.bytes)} across ${m.measured} ${m.measured === 1 ? 'entry' : 'entries'}`]
  if (m.opaque > 0) parts.push(`${m.opaque} opaque (size hidden, not counted)`)
  if (m.capped) parts.push(`stopped at ${MEASURE_CAP} of ${m.total}`)
  return parts.join('; ')
}

/** One bucket: its name and version, how many entries, what it would cost to keep, and the entries on demand. */
export function CacheCard({ member, summary, newest, tick, filter, onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState<Progress>({ state: 'idle' })
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const measure = async (): Promise<void> => {
    const controller = new AbortController()
    abort.current = controller
    setProgress({ state: 'running', done: 0, total: summary?.count ?? 0 })
    try {
      const result = await measureCache(member.name, (done, total) => setProgress({ state: 'running', done, total }), controller.signal)
      setProgress(controller.signal.aborted ? { state: 'idle' } : { state: 'done', result })
    } catch (err) {
      setProgress({ state: 'failed', message: toAppError(err, { source: 'lab:cache-measure' }).message })
    }
  }

  const remove = async (): Promise<void> => {
    setConfirm(false)
    try {
      await deleteCache(member.name)
      onChanged()
    } catch (err) {
      setError(toAppError(err, { source: 'lab:cache-delete' }).message)
    }
  }

  const count = summary?.count
  return (
    <li className={`${styles.card} ${member.superseded ? styles.superseded : ''}`}>
      <div className={styles.head}>
        <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} />
          <span className={styles.name}>{member.name}</span>
        </button>
        <div className={styles.badges}>
          {member.version !== null ? <Tag tone="info">v{member.version}</Tag> : <Tag title="No version in the name, so nothing can tell which copy is current">unversioned</Tag>}
          {member.superseded ? (
            <Tag tone="warn" icon="warning">
              superseded
            </Tag>
          ) : null}
          <Tag tone={summary?.error ? 'error' : 'neutral'}>{summary?.error ? 'unreadable' : count === undefined || count === null ? '...' : `${count} ${count === 1 ? 'entry' : 'entries'}`}</Tag>
        </div>
        <div className={styles.tools}>
          <Button size="sm" icon="hourglass" loading={progress.state === 'running'} onClick={() => void measure()}>
            Measure size
          </Button>
          <Button size="sm" variant="danger" icon="trash" onClick={() => setConfirm(true)}>
            Delete
          </Button>
        </div>
      </div>
      {member.superseded && newest !== null ? <p className={styles.note}>v{member.version}: {supersededNote(newest)}.</p> : null}
      {summary?.error ? <ErrorState compact error={toAppError(new Error(summary.error), { source: 'lab:cache-read' })} /> : null}
      {error ? <p className={styles.note}>Delete failed: {error}</p> : null}
      {progress.state !== 'idle' ? (
        <div className={styles.measure} role="status">
          {progress.state === 'running' ? <Meter label="Reading bodies" size="sm" value={progress.done} max={Math.max(1, Math.min(progress.total, MEASURE_CAP))} valueText={`${progress.done} of ${Math.min(progress.total, MEASURE_CAP)}`} /> : null}
          {progress.state === 'done' ? <span>{measurementText(progress.result)}</span> : null}
          {progress.state === 'failed' ? <span>Could not measure: {progress.message}</span> : null}
        </div>
      ) : null}
      {open ? (
        <div className={styles.body}>
          <CacheEntries cacheName={member.name} tick={tick} filter={filter} onChanged={onChanged} />
        </div>
      ) : null}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        size="sm"
        title="Delete this cache?"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="danger" data-autofocus onClick={() => void remove()}>
              Delete cache
            </Button>
          </>
        }
      >
        <p>
          <code>{member.name}</code> and its {count ?? 'all'} entries go. A worker that still expects it will miss on the next fetch.
        </p>
      </Dialog>
    </li>
  )
}
