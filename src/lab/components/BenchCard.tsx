import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BENCH_KEYS, type LabTruth } from '@shared/contracts'
import { useBumpBench } from '@/lib/queries'
import { Button, CopyButton, Plate, Segmented, type SegmentedOption } from '@/ui'
import { ErrorStamp } from './BenchBadges'
import { BenchHistory } from './BenchHistory'
import { BenchPrecached } from './BenchPrecached'
import { BenchResult } from './BenchResult'
import { fetchBatch, fetchOnce } from './BenchRun'
import { useBenchStore } from './BenchStore'
import { KEY_NOTE, type StrategyInfo } from './BenchStrategies'
import styles from './BenchCard.module.css'

const KEY_OPTIONS: SegmentedOption<string>[] = BENCH_KEYS.map((k) => ({ value: k, label: k }))

interface Props {
  info: StrategyInfo
  index: number
  truth: LabTruth | undefined
  /** A race or a scenario is running. */
  locked: boolean
  showProvenance: boolean
}

/** One strategy: what it is, how to match it, three ways to poke it, and what came back. */
export function BenchCard({ info, index, truth, locked, showProvenance }: Props) {
  const qc = useQueryClient()
  const [key, setKey] = useState<string>('alpha')
  const readings = useBenchStore((s) => s.readings[info.id])
  const busy = useBenchStore((s) => s.busy[info.id])
  const clear = useBenchStore((s) => s.clear)
  const bump = useBumpBench()
  const idle = !locked && !busy

  const showKeyNote = info.id === 'cache-only' || key === 'delta'

  return (
    <Plate index={index} title={info.name} className={styles.card}>
      <div className={styles.stack}>
        <p className={styles.prose}>
          {info.how} {info.when} <span className={styles.fails}>It fails {info.fails.charAt(0).toLowerCase()}{info.fails.slice(1)}</span>
        </p>

        <div className={styles.pattern}>
          <span className={styles.patternLabel}>Match in the worker</span>
          <code className={styles.code}>{info.pattern}</code>
          <CopyButton value={info.pattern} iconOnly label="Copy URL pattern" size="sm" variant="quiet" />
        </div>

        <div className={styles.controls}>
          <Segmented label={`Key for ${info.name}`} options={KEY_OPTIONS} value={key} onChange={setKey} size="sm" showLabel />
          {showKeyNote ? <p className={styles.keyNote}>{KEY_NOTE}</p> : null}
          <div className={styles.buttons}>
            <Button variant="primary" size="sm" icon="refresh" loading={busy} disabled={locked} onClick={() => void fetchOnce(qc, info.id, key)}>
              Fetch
            </Button>
            <Button size="sm" icon="queue" disabled={!idle} onClick={() => void fetchBatch(qc, info.id, key)}>
              Fetch x5
            </Button>
            <Button size="sm" icon="arrow-up" loading={bump.isPending} disabled={locked} onClick={() => bump.mutate({ strategy: info.id, key })}>
              Bump on server
            </Button>
          </div>
          <p className={styles.bumpNote} role="status">
            {bump.error ? <ErrorStamp error={bump.error} /> : null}
            {bump.data && bump.variables ? `The truth changed: ${bump.variables.key} is now rev ${bump.data.data.rev} on the server. No cached copy knows yet.` : null}
          </p>
        </div>

        {info.id === 'cache-only' ? <BenchPrecached selected={key} /> : null}

        <BenchResult reading={readings[0]} truth={truth} busy={busy} showProvenance={showProvenance} />
        <BenchHistory strategy={info.id} readings={readings} onClear={() => clear(info.id)} />
      </div>
    </Plate>
  )
}
