import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { notify, useLabSetting } from '@/lib'
import { useLabTruth } from '@/lib/queries'
import { ErrorState, FieldNotes, PageHeader, ProvenanceChip } from '@/ui'
import { BenchCards } from '../components/BenchCards'
import { restoreAbandonedBench, useBenchLocked } from '../components/BenchExperiments'
import { BenchRace } from '../components/BenchRace'
import { useSettleBenchSeen } from '../components/BenchRun'
import { BenchScenarios } from '../components/BenchScenarios'
import { BenchVersionedCaches } from '../components/BenchVersionedCaches'

export default function BenchPage() {
  const truth = useLabTruth({ pollMs: 2000 })
  const showProvenance = useLabSetting('showProvenance')
  const locked = useBenchLocked()
  const [runKey, setRunKey] = useState<string>('alpha')
  const queryClient = useQueryClient()
  useSettleBenchSeen()
  useEffect(() => {
    void restoreAbandonedBench(queryClient).then((restored) => {
      if (restored) notify({ tone: 'info', key: 'bench-chaos-restored', title: 'Chaos cleared', message: 'A Bench scenario was cut short by a reload and had left the relay hard down. All chaos is off again.' })
    })
  }, [queryClient])
  // A poll that is still retrying has no `error` yet; `failureReason` is what has gone wrong so far.
  const truthError = truth.error ?? truth.failureReason

  return (
    <>
      <PageHeader
        eyebrow="Lab / Nº 04 / Bench"
        title="Strategy bench"
        description="Five routes that answer the same question and differ only in their URL, so a worker can give each its own caching rule. Every reading is judged against what the server holds."
        meta={showProvenance ? <ProvenanceChip meta={truth.meta} /> : null}
      />
      <FieldNotes
        experiments={[
          <>Press <strong>Run all five</strong> before any worker exists. Every row says network and FRESH: that is the baseline your strategies have to beat.</>,
          <>Write a cache-first rule for the <code>cache-first</code> route, then use <strong>Bump on server</strong> and Fetch. It stays STALE, and Hits + stays 0.</>,
          <>Run <strong>Server down</strong>. Network only should fail with a network error; the other four should answer from what they stored.</>,
          <>Precache alpha, beta and gamma for cache only, then fetch <code>delta</code>. The cache-miss error is the route working.</>,
        ]}
      >
        Each card takes a reading through the same query layer the product uses, then asks the server what the revision really is. FRESH means the two agree. STALE by N means the answer is N
        bumps behind. SERVER SAW IT means the server&apos;s own request log holds this fetch; if it does not, something between the page and the relay answered instead.
      </FieldNotes>

      {truthError ? <ErrorState compact={truth.data !== undefined} error={truthError} onRetry={() => void truth.refetch()} retrying={truth.isFetching} /> : null}

      <BenchRace runKey={runKey} onRunKey={setRunKey} />
      <BenchScenarios runKey={runKey} />

      <BenchCards truth={truth.data} locked={locked} showProvenance={showProvenance} />

      <BenchVersionedCaches />
    </>
  )
}
