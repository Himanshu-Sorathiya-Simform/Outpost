import { useRef, useState } from 'react'
import { useLabFeedStore, useResourceLog } from '@/lib'
import { Button, Field, Plate, Segmented, Select } from '@/ui'
import { fireProbe } from './ChaosProbeRun'
import { useProbeStore } from './ChaosProbeStore'
import { PROBE_TARGETS, targetById } from './ChaosProbeTargets'
import styles from './ChaosProbe.module.css'

type Count = '1' | '5' | '20'
const COUNTS: Array<{ value: Count; label: string }> = [
  { value: '1', label: '1 time' },
  { value: '5', label: '5 times' },
  { value: '20', label: '20 times' },
]
const TIMEOUTS = [
  { value: 'lab', label: 'Lab setting' },
  { value: '2000', label: '2 s' },
  { value: '5000', label: '5 s' },
  { value: '15000', label: '15 s' },
]
const TARGET_OPTIONS = PROBE_TARGETS.map((t) => ({ value: t.id, label: t.label }))

/** Picks a real script path the page loaded, so the /assets/ probe has something that exists when chaos is off. */
function loadedAsset(): string | null {
  const hit = useResourceLog.getState().entries.find((e) => e.category === 'script' && e.path.startsWith('/assets/'))
  return hit ? hit.path.split('?', 1)[0] ?? null : null
}

/** Fire real requests through apiFetch and watch what the client makes of them. Every attempt lands in the ledger below. */
export function ChaosProbe() {
  const [targetId, setTargetId] = useState(PROBE_TARGETS[0]?.id ?? '')
  const [count, setCount] = useState<Count>('5')
  const [timeout, setTimeoutChoice] = useState('lab')
  const running = useProbeStore((s) => s.running)
  const abort = useRef<AbortController | null>(null)
  const target = targetById(targetId)

  const fire = (): void => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    void fireProbe({
      target,
      count: Number(count),
      timeoutMs: timeout === 'lab' ? undefined : Number(timeout),
      assetPath: loadedAsset(),
      state: useLabFeedStore.getState().labState?.chaos ?? null,
      signal: controller.signal,
    })
  }

  return (
    <Plate index="Nº 0705" title="Probe">
      <div className={styles.stack}>
        <div className={styles.controls}>
          <Field label="Target" className={styles.target}>
            <Select value={targetId} options={TARGET_OPTIONS} onChange={(e) => setTargetId(e.target.value)} />
          </Field>
          <Field label="Give up after" className={styles.timeout}>
            <Select value={timeout} options={TIMEOUTS} onChange={(e) => setTimeoutChoice(e.target.value)} />
          </Field>
          <Segmented<Count> label="Fire" showLabel options={COUNTS} value={count} onChange={setCount} />
          <div className={styles.buttons}>
            <Button variant="primary" icon="bolt" onClick={fire}>
              {running > 0 ? 'Fire again' : 'Fire'}
            </Button>
            <Button icon="stop" disabled={running === 0} onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          </div>
        </div>
        <p className={styles.note}>
          <strong>
            {target.method} {typeof target.path === 'string' ? target.path : '/assets/ (a script this page loaded)'}
          </strong>
          . {target.note} Four requests run at a time. Every target is a GET or HEAD, so the drop mode and the Dropped writes preset cannot show here: use a custom GET rule with mode drop. Probes go through apiFetch, so they also appear in the client log on the Network page.
        </p>
        <p className={styles.running} role="status" aria-live="polite">
          {running > 0 ? `${running} in flight or waiting.` : ''}
        </p>
      </div>
    </Plate>
  )
}
