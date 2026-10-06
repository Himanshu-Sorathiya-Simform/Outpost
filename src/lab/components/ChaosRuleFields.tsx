import { ChaosMode, type ChaosRule } from '@shared/contracts'
import { Field, Input, Select, type SelectOption } from '@/ui'
import type { RuleErrors } from './ChaosModel'
import styles from './ChaosRuleFields.module.css'

const METHODS: SelectOption[] = ['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m }))
const MODES: SelectOption[] = ChaosMode.options.map((m) => ({ value: m, label: m }))

const show = (n: number): string | number => (Number.isNaN(n) ? '' : n)
const parse = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text))

export interface ChaosRuleFieldsProps {
  rule: ChaosRule
  errors: RuleErrors
  onChange: (patch: Partial<ChaosRule>) => void
}

/** Every field of a ChaosRule, edited in place. Status and Retry-After only matter to their own modes and say so. */
export function ChaosRuleFields({ rule, errors, onChange }: ChaosRuleFieldsProps) {
  const pct = Number.isNaN(rule.probability) ? 0 : Math.min(1, Math.max(0, rule.probability))
  return (
    <div className={styles.grid}>
      <Field label="Label" hint="Printed in the X-Chaos header." error={errors.label} className={styles.wide}>
        <Input value={rule.label} maxLength={100} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Method" error={errors.method}>
        <Select value={rule.method} options={METHODS} onChange={(e) => onChange({ method: e.target.value as ChaosRule['method'] })} />
      </Field>
      <Field label="Path prefix" hint="Matched with startsWith on the path." error={errors.pathPrefix}>
        <Input value={rule.pathPrefix} spellCheck={false} autoComplete="off" onChange={(e) => onChange({ pathPrefix: e.target.value })} />
      </Field>
      <Field label="Latency (ms)" hint="Always applied." error={errors.latencyMs}>
        <Input type="number" inputMode="numeric" min={0} max={60000} step={100} value={show(rule.latencyMs)} onChange={(e) => onChange({ latencyMs: parse(e.target.value) })} />
      </Field>
      <Field label="Jitter (ms)" hint="Adds a random 0 to this much." error={errors.jitterMs}>
        <Input type="number" inputMode="numeric" min={0} max={60000} step={100} value={show(rule.jitterMs)} onChange={(e) => onChange({ jitterMs: parse(e.target.value) })} />
      </Field>
      <Field label="Mode" hint="What happens when the rule fires." error={errors.mode}>
        <Select value={rule.mode} options={MODES} onChange={(e) => onChange({ mode: ChaosMode.parse(e.target.value) })} />
      </Field>
      <Field label="Status" hint={rule.mode === 'status' ? 'Answered with this HTTP status.' : 'Used by mode status only.'} error={errors.status}>
        <Input type="number" inputMode="numeric" min={400} max={599} value={show(rule.status)} disabled={rule.mode !== 'status'} onChange={(e) => onChange({ status: parse(e.target.value) })} />
      </Field>
      <Field label="Retry-After (s)" hint={rule.mode === 'rate-limit' ? 'Sent with the 429.' : 'Used by mode rate-limit only.'} error={errors.retryAfterSec}>
        <Input type="number" inputMode="numeric" min={0} max={3600} value={show(rule.retryAfterSec)} disabled={rule.mode !== 'rate-limit'} onChange={(e) => onChange({ retryAfterSec: parse(e.target.value) })} />
      </Field>
      <Field label="Probability" hint={`The mode fires on ${Math.round(pct * 100)}% of matching requests. Latency always applies.`} error={errors.probability} className={styles.wide}>
        <div className={styles.prob}>
          <input
            type="range"
            className={styles.range}
            min={0}
            max={1}
            step={0.05}
            value={pct}
            aria-label="Probability slider"
            onChange={(e) => onChange({ probability: Number(e.target.value) })}
          />
          <Input
            className={styles.probNumber}
            type="number"
            inputMode="decimal"
            min={0}
            max={1}
            step={0.05}
            value={show(rule.probability)}
            aria-label="Probability, 0 to 1"
            onChange={(e) => onChange({ probability: parse(e.target.value) })}
          />
        </div>
      </Field>
      <p className={styles.id}>
        Id <code>{rule.id}</code>
      </p>
    </div>
  )
}
