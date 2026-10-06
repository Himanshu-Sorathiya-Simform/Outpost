import { useMemo, useState } from 'react'
import { APP_ERROR_KINDS, errorCenter, useErrorCounts, useErrorRecords, type AppErrorKind } from '@/lib'
import { Button, CopyButton, EmptyState, Plate, Stat, StatGroup } from '@/ui'
import { ErrorsKindStamp } from './ErrorsKindStamp'
import { ErrorsRecordRow, recordToJson } from './ErrorsRecordRow'
import styles from './ErrorsViewer.module.css'

const PAGE = 40

/** The error centre as a ledger: a stamp per kind that has been seen (click to filter), then the rows, newest first. */
export function ErrorsViewer() {
  const records = useErrorRecords()
  const counts = useErrorCounts()
  const [kind, setKind] = useState<AppErrorKind | null>(null)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [shown, setShown] = useState(PAGE)

  const seen = useMemo(() => APP_ERROR_KINDS.filter((k) => counts[k] > 0), [counts])
  const total = useMemo(() => seen.reduce((sum, k) => sum + counts[k], 0), [seen, counts])
  // A filter whose kind has since been cleared would show an empty list with no stamp to undo it.
  const active = kind !== null && counts[kind] > 0 ? kind : null
  const visible = useMemo(() => (active ? records.filter((r) => r.error.kind === active) : records), [records, active])

  const toggle = (id: string): void =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const clear = (): void => {
    errorCenter.clear()
    setOpen(new Set())
    setKind(null)
    setShown(PAGE)
  }

  return (
    <Plate
      index={1}
      title="Error centre"
      actions={
        <>
          <CopyButton value={() => JSON.stringify(visible.map(recordToJson), null, 2)} label="Copy as JSON" />
          <Button size="sm" variant="danger" icon="trash" disabled={records.length === 0} onClick={clear}>
            Clear
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <StatGroup>
          <Stat label="Occurrences" value={total} note="since the page loaded or the last clear" />
          <Stat label="Rows" value={records.length} note="identical neighbours collapse into one" />
          <Stat label="Kinds seen" value={seen.length} note={`of ${APP_ERROR_KINDS.length}`} />
        </StatGroup>

        {seen.length > 0 ? (
          <div className={styles.stamps} role="group" aria-label="Filter by error kind">
            <Button size="sm" variant={active === null ? 'primary' : 'ghost'} aria-pressed={active === null} onClick={() => setKind(null)}>
              All {total}
            </Button>
            {seen.map((k) => (
              <ErrorsKindStamp key={k} kind={k} count={counts[k]} pressed={active === k} onPress={() => setKind(active === k ? null : k)} />
            ))}
          </div>
        ) : null}

        <div aria-live="polite" className="sr-only">
          {active ? `Showing ${visible.length} rows of kind ${active}` : `${records.length} rows in the error centre`}
        </div>

        {records.length === 0 ? (
          <EmptyState title="Nothing filed" icon="bug">
            No failure has reached the centre since this page loaded. Run one of the simulators below, or turn the network off in DevTools and use the app.
          </EmptyState>
        ) : (
          <>
            <ol className={styles.list} aria-label="Error centre rows, newest first">
              {visible.slice(0, shown).map((record) => (
                <ErrorsRecordRow key={record.id} record={record} open={open.has(record.id)} onToggle={() => toggle(record.id)} />
              ))}
            </ol>
            {visible.length > shown ? (
              <Button size="sm" onClick={() => setShown(shown + PAGE)}>
                Show {Math.min(PAGE, visible.length - shown)} more of {visible.length - shown}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </Plate>
  )
}
