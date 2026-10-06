import { usePwaStore } from '@/pwa'
import { compareSources, type Verdict } from '../observers/worker-compare'
import { displayModeMatches, useDisplayMode } from '../observers/runtime-facts'
import { useWorkerSnapshot } from '../observers/worker-observer'
import { Plate, Table, Tag, TBody, Td, Th, THead, Tr, type IconName, type Tone } from '@/ui'
import stacked from './EnvStacked.module.css'
import styles from './WorkerCompare.module.css'

const STAMP: Record<Verdict, { tone: Tone; icon: IconName; label: string; flag?: 'ok' | 'error' }> = {
  match: { tone: 'ok', icon: 'check', label: 'Match', flag: 'ok' },
  mismatch: { tone: 'error', icon: 'warning', label: 'Mismatch', flag: 'error' },
  unknown: { tone: 'neutral', icon: 'info', label: 'Cannot tell' },
}

/** What the app's own store claims, row by row, against what the browser reports. Disagreements are bugs in src/pwa. */
export function WorkerCompare() {
  const app = usePwaStore()
  const snap = useWorkerSnapshot()
  useDisplayMode()
  const rows = compareSources(app, snap, displayModeMatches('standalone'), typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const bad = rows.filter((r) => r.verdict === 'mismatch').length

  return (
    <Plate index="Nº 0002" title="The store against the browser">
      <div className={styles.body}>
        <p className={styles.summary} role="status">
          {bad === 0 ? 'Both sources agree on every row they can both answer.' : `${bad} ${bad === 1 ? 'row disagrees' : 'rows disagree'}. The browser is right; the store is what src/pwa wrote.`}
        </p>
        <Table caption="usePwaStore claims against browser state" dense minWidth={0} className={stacked.stack}>
          <THead>
            <Tr>
              <Th>Field</Th>
              <Th>The app claims</Th>
              <Th>The browser reports</Th>
              <Th>Verdict</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((r) => {
              const stamp = STAMP[r.verdict]
              return (
                <Tr key={r.key} flag={stamp.flag}>
                  <Td mono nowrap className={styles.key}>
                    {r.key}
                  </Td>
                  <Td mono className={styles.value}>
                    <span className={stacked.label}>The app claims</span>
                    {r.app}
                  </Td>
                  <Td mono className={styles.value}>
                    <span className={stacked.label}>The browser reports</span>
                    {r.browser}
                  </Td>
                  <Td>
                    <Tag tone={stamp.tone} icon={stamp.icon}>
                      {stamp.label}
                    </Tag>
                    {r.why ? <span className={styles.why}>{r.why}</span> : null}
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
      </div>
    </Plate>
  )
}
