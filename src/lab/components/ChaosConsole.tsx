import type { ChaosState } from '@shared/contracts'
import { useLabState } from '@/lib/queries'
import { useLabSetting } from '@/lib'
import { ErrorState, Loader, Plate, ProvenanceChip, Skeleton } from '@/ui'
import { ChaosBanner } from './ChaosBanner'
import { ChaosExpected } from './ChaosExpected'
import { ChaosLedger } from './ChaosLedger'
import { ChaosPresets } from './ChaosPresets'
import { ChaosProbe } from './ChaosProbe'
import { ChaosRules } from './ChaosRules'
import { ChaosSwitches } from './ChaosSwitches'
import { useChaosDraft } from './useChaosDraft'
import styles from './ChaosConsole.module.css'

function Controls({ chaos }: { chaos: ChaosState }) {
  const draft = useChaosDraft(chaos)
  return (
    <>
      <ChaosBanner chaos={chaos} />
      <ChaosSwitches chaos={chaos} />
      <ChaosPresets chaos={chaos} />
      <ChaosRules draft={draft} />
    </>
  )
}

/** Loads the server's chaos state, then hands it to the controls. The probe, the ledger and the expectations table work without it. */
export function ChaosConsole() {
  const query = useLabState({ pollMs: 4000 })
  const showProvenance = useLabSetting('showProvenance')
  const chaos = query.data?.chaos

  return (
    <>
      {showProvenance ? (
        <div className={styles.meta}>
          <ProvenanceChip meta={query.meta} />
        </div>
      ) : null}
      {chaos ? (
        <>
          {query.error ? <ErrorState compact error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
          <Controls chaos={chaos} />
        </>
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <Plate index="Nº 0701" title="Chaos state" aria-busy="true">
          <div className={styles.loading} role="status" aria-label="Loading chaos state">
            <Loader label="Reading the relay" />
            <Skeleton variant="block" height={96} />
          </div>
        </Plate>
      )}
      <ChaosProbe />
      <ChaosLedger />
      <ChaosExpected />
    </>
  )
}
