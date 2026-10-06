import type { ChaosState } from '@shared/contracts'
import { useApplyChaosPreset } from '@/lib/queries'
import { Button, ErrorState, Plate, StatusDot } from '@/ui'
import { PRESETS, type PresetInfo } from './ChaosModel'
import styles from './ChaosPresets.module.css'

function isOn(preset: PresetInfo, chaos: ChaosState): boolean {
  if (preset.id === 'hard-down') return chaos.serverOffline
  if (preset.id === 'schema-drift') return chaos.schemaDrift
  if (preset.type === 'reset') return false
  return chaos.rules.some((r) => r.id === preset.id && r.enabled)
}

function PresetCard({ preset, on, busy, onApply }: { preset: PresetInfo; on: boolean; busy: boolean; onApply: () => void }) {
  const reset = preset.type === 'reset'
  return (
    <article className={styles.card} data-on={on || undefined} aria-labelledby={`preset-${preset.id}`}>
      <header className={styles.head}>
        <h3 id={`preset-${preset.id}`} className={styles.name}>
          {preset.name}
        </h3>
        {reset ? null : <StatusDot tone={on ? 'warn' : 'idle'} live={on} label={on ? 'On' : 'Off'} />}
      </header>
      <dl className={styles.facts}>
        <div>
          <dt>Does</dt>
          <dd>{preset.does}</dd>
        </div>
        <div>
          <dt>Should produce</dt>
          <dd>{preset.produces}</dd>
        </div>
        <div>
          <dt>Exercises</dt>
          <dd>{preset.exercises}</dd>
        </div>
      </dl>
      <div className={styles.foot}>
        <Button
          size="sm"
          variant={reset ? 'primary' : on ? 'ghost' : 'danger'}
          icon={reset ? 'check' : on ? 'stop' : 'bolt'}
          loading={busy}
          onClick={onApply}
          aria-label={`${reset ? 'Apply' : on ? 'Switch off' : 'Switch on'} preset: ${preset.name}`}
        >
          {reset ? 'Clear everything' : on ? 'Switch off' : 'Switch on'}
        </Button>
      </div>
    </article>
  )
}

/** Fifteen ready-made faults. A rule preset toggles the stock rule with that id (adding it back if you deleted it). */
export function ChaosPresets({ chaos }: { chaos: ChaosState }) {
  const apply = useApplyChaosPreset()
  const pending = apply.isPending ? apply.variables : null
  return (
    <Plate index="Nº 0703" title="Presets">
      {apply.error ? (
        <div className={styles.error}>
          <ErrorState compact error={apply.error} onRetry={apply.variables ? () => apply.mutate(apply.variables) : undefined} retrying={apply.isPending} />
        </div>
      ) : null}
      <div className={styles.grid}>
        {PRESETS.map((p) => (
          <PresetCard key={p.id} preset={p} on={isOn(p, chaos)} busy={pending === p.id} onApply={() => apply.mutate(p.id)} />
        ))}
      </div>
    </Plate>
  )
}
