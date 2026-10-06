import { useCallback, useLayoutEffect } from 'react'
import { useLabSetting } from '@/lib'
import { useSignal } from '@/lib/queries'
import { Button, EmptyState, ErrorState, Loader, PageHeader, Plate, ProvenanceChip, StatusDot } from '@/ui'
import { currentFailure } from '@/features/stations/freshness'
import { useMediaQuery } from '@/features/stations/useMediaQuery'
import { BoardFigures } from '../BoardFigures'
import { BoardStamps } from '../BoardStamps'
import { FieldNote } from '../FieldNote'
import { useSignalSession } from '../history'
import { SignalLedger } from '../SignalLedger'
import { SignalList } from '../SignalList'
import { STALE_AFTER_MS, assessSample } from '../signal'
import { useBoardPolling, useResampleOnResume } from '../useBoardPolling'
import { useClock } from '../useClock'
import styles from './SignalPage.module.css'

/**
 * The live board. The only page where a stored answer is always wrong, so it checks every response for signs of
 * being one, and stamps the board when the link is down instead of letting old figures pass as current.
 */
export default function SignalPage() {
  const showProvenance = useLabSetting('showProvenance')
  const narrow = useMediaQuery('(max-width: 640px)')
  const now = useClock()
  const samples = useSignalSession((s) => s.samples)
  const latency = useSignalSession((s) => s.latency)
  const record = useSignalSession((s) => s.record)

  const polling = useBoardPolling()
  const query = useSignal({ pollMs: polling.pollMs })
  const { data: board, isFetching, dataUpdatedAt, meta, refetch } = query
  const error = currentFailure(query)
  const resample = useCallback(() => void refetch({ cancelRefetch: false }), [refetch])
  useResampleOnResume(polling.pollMs > 0, resample)

  useLayoutEffect(() => {
    if (board) record(board, meta, dataUpdatedAt)
  }, [board, meta, dataUpdatedAt, record])

  const sample = samples.find((s) => s.receivedAt === dataUpdatedAt)
  const suspicion = board ? (sample ? sample.suspicion : assessSample(board, meta, dataUpdatedAt, null)) : null

  const sampledMs = board ? Date.parse(board.sampledAt) : Number.NaN
  const age = board && now !== 0 && !Number.isNaN(sampledMs) ? now - sampledMs : null
  const stale = age !== null && age > STALE_AFTER_MS
  const live = board !== undefined && !error && !suspicion && !polling.paused && polling.visible && !stale
  const condition = error ? 'No link' : suspicion ? 'Possibly cached' : polling.paused ? 'Paused' : !polling.visible ? 'Tab hidden' : stale ? 'Stale' : 'Live'

  const pollingLabel = polling.paused ? 'Paused' : !polling.visible ? 'Tab hidden' : 'Every 5 s'

  return (
    <>
      <PageHeader
        eyebrow="Register / Signal"
        title="Signal board"
        description="Readings from every station, taken by the relay as you ask. Nothing on this page may come from storage."
        actions={
          <>
            <Button icon={polling.paused ? 'play' : 'pause'} onClick={polling.toggle} aria-pressed={polling.paused}>
              {polling.paused ? 'Resume' : 'Pause'}
            </Button>
            <Button variant="primary" icon="refresh" loading={isFetching} onClick={resample}>
              Sample now
            </Button>
          </>
        }
        meta={
          <>
            <StatusDot tone={live ? 'ok' : error ? 'error' : board ? 'warn' : 'idle'} live={live} label={board ? condition : 'No reading yet'} />
            {showProvenance ? (
              <span className={styles.provenance}>
                {error && board ? <span className={styles.asOf}>Last good response</span> : null}
                <ProvenanceChip meta={meta} />
              </span>
            ) : null}
          </>
        }
      />

      {board ? (
        <>
          <Plate index="Nº 0400" title="Board" aria-busy={isFetching}>
            <div className={styles.body}>
              <BoardFigures board={board} now={now} pollingLabel={pollingLabel} />
              <BoardStamps
                board={board}
                now={now}
                error={error}
                retrying={isFetching}
                failureCount={query.failureCount}
                suspicion={suspicion}
                mode={polling.paused ? 'paused' : polling.visible ? 'polling' : 'hidden'}
              />
            </div>
          </Plate>
          <Plate index="Nº 0401" title={live ? 'Readings' : 'Readings (last known)'} flush className={live ? undefined : styles.frozen}>
            {board.readings.length === 0 ? (
              <EmptyState title="No readings on the board" icon="signal" compact>
                The relay answered with an empty board. No station is reporting.
              </EmptyState>
            ) : narrow ? (
              <SignalList readings={board.readings} />
            ) : (
              <SignalLedger readings={board.readings} latency={latency} />
            )}
          </Plate>
        </>
      ) : error ? (
        <ErrorState error={error} onRetry={resample} retrying={isFetching} />
      ) : (
        <div className={styles.loading}>
          <Loader label="Waiting for the first sample" />
        </div>
      )}

      <FieldNote />
    </>
  )
}
