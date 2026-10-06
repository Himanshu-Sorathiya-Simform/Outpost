import type { LabTruth } from '@shared/contracts'
import { BenchCard } from './BenchCard'
import { STRATEGIES } from './BenchStrategies'
import styles from './BenchCards.module.css'

interface Props {
  truth: LabTruth | undefined
  locked: boolean
  showProvenance: boolean
}

/** The five strategy cards, two across on a wide screen. */
export function BenchCards({ truth, locked, showProvenance }: Props) {
  return (
    <div className={styles.cards}>
      {STRATEGIES.map((info, i) => (
        <BenchCard key={info.id} info={info} index={410 + i} truth={truth} locked={locked} showProvenance={showProvenance} />
      ))}
    </div>
  )
}
