import { useState } from 'react'
import { useLabSetting } from '@/lib'
import { useSignal } from '@/lib/queries'
import { BoardStamps } from '@/features/signal/BoardStamps'
import { ReadingFacts } from '@/features/signal/ReadingFacts'
import { useSignalSession } from '@/features/signal/history'
import { assessSample } from '@/features/signal/signal'
import { useClock } from '@/features/signal/useClock'
import { Button, EmptyState, ErrorState, Loader, Plate, ProvenanceChip, Switch, TimeAgo, formatClock } from '@/ui'
import { currentFailure } from './freshness'
import styles from './StationSignal.module.css'

function LiveReading({ code }: { code: string }) {
  const query = useSignal()
  const showProvenance = useLabSetting('showProvenance')
  const now = useClock()
  const samples = useSignalSession((s) => s.samples)
  const { data: board, isFetching, dataUpdatedAt, meta } = query
  const error = currentFailure(query)

  if (!board) {
    return error ? (
      <ErrorState compact error={error} onRetry={() => void query.refetch()} retrying={isFetching} />
    ) : (
      <div role="status" className={styles.loading}>
        <Loader label="Sampling" size="sm" />
      </div>
    )
  }

  const reading = board.readings.find((r) => r.stationCode === code)
  const recorded = samples.find((s) => s.receivedAt === dataUpdatedAt)
  const suspicion = recorded ? recorded.suspicion : assessSample(board, meta, dataUpdatedAt, null)
  const resample = (): void => void query.refetch()

  return (
    <div className={styles.live}>
      <BoardStamps board={board} now={now} error={error} retrying={isFetching} failureCount={query.failureCount} suspicion={suspicion} mode="manual" />
      {reading ? <ReadingFacts reading={reading} /> : <EmptyState title={`${code} is not on the board`} icon="signal" compact>The relay sent readings for other stations only.</EmptyState>}
      <div className={styles.foot}>
        <p className={styles.sample}>
          Sample Nº {board.seq} from {formatClock(board.sampledAt)}, <TimeAgo at={board.sampledAt} />.
        </p>
        <Button size="sm" icon="refresh" loading={isFetching} onClick={resample}>
          Sample again
        </Button>
        {showProvenance ? <ProvenanceChip meta={meta} /> : null}
      </div>
    </div>
  )
}

/** One station's line on the signal board. Off until asked for: opening a station page must not start a live feed. */
export function StationSignal({ code }: { code: string }) {
  const [on, setOn] = useState(false)
  return (
    <Plate index="Nº 0303" title="Live signal">
      <div className={styles.body}>
        <Switch checked={on} onChange={setOn} label="Show live signal" description="Takes one sample from the relay. It does not poll." />
        {on ? <LiveReading code={code} /> : null}
      </div>
    </Plate>
  )
}
