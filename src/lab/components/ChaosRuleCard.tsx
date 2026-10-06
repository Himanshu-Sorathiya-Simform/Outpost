import { useId, useState } from 'react'
import type { ChaosRule } from '@shared/contracts'
import { cx, formatDuration, Icon, IconButton, Switch, Tag } from '@/ui'
import { ChaosRuleFields } from './ChaosRuleFields'
import type { RuleErrors } from './ChaosModel'
import styles from './ChaosRuleCard.module.css'

export interface ChaosRuleCardProps {
  index: number
  count: number
  rule: ChaosRule
  errors: RuleErrors
  /** Zero-based index of the earlier rule that always matches first, if any. */
  shadowedBy: number | null
  onChange: (patch: Partial<ChaosRule>) => void
  onMove: (delta: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
}

function latencyText(rule: ChaosRule): string {
  if (rule.latencyMs === 0 && rule.jitterMs === 0) return 'no delay'
  if (rule.jitterMs === 0) return `${formatDuration(rule.latencyMs)} delay`
  return `${formatDuration(rule.latencyMs)} to ${formatDuration(rule.latencyMs + rule.jitterMs)} delay`
}

const probText = (p: number): string => (Number.isNaN(p) ? '?' : p >= 1 ? 'always' : `${Math.round(p * 100)}%`)

/** One rule in the list: a header that always shows what it does, and the fields behind a disclosure. */
export function ChaosRuleCard({ index, count, rule, errors, shadowedBy, onChange, onMove, onDuplicate, onDelete }: ChaosRuleCardProps) {
  const bodyId = useId()
  const [userOpen, setUserOpen] = useState(false)
  const problems = Object.keys(errors).length
  const open = userOpen || problems > 0
  return (
    <li className={cx(styles.card, rule.enabled && styles.enabled, problems > 0 && styles.invalid)} aria-label={`Rule ${index + 1}: ${rule.label}`}>
      <div className={styles.head}>
        <span className={styles.no} aria-hidden="true">
          {index + 1}
        </span>
        <div className={styles.order}>
          <IconButton icon="arrow-up" label={`Move rule ${index + 1} up`} size="sm" variant="quiet" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton icon="arrow-down" label={`Move rule ${index + 1} down`} size="sm" variant="quiet" disabled={index === count - 1} onClick={() => onMove(1)} />
        </div>
        <Switch label={`Enable rule ${index + 1}: ${rule.label}`} labelHidden checked={rule.enabled} onChange={(enabled) => onChange({ enabled })} />
        <button type="button" className={styles.summary} aria-expanded={open} aria-controls={bodyId} onClick={() => setUserOpen(!userOpen)} disabled={problems > 0}>
          <span className={styles.line}>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} />
            <span className={styles.label}>{rule.label || 'Unnamed rule'}</span>
          </span>
          <span className={styles.meta}>
            {rule.method} {rule.pathPrefix || '(no prefix)'} / {rule.mode} / {probText(rule.probability)} / {latencyText(rule)}
          </span>
        </button>
        <div className={styles.tags}>
          {shadowedBy !== null ? (
            <Tag tone="warn" icon="warning" title={`Rule ${shadowedBy + 1} matches every request this rule would, and the first enabled match wins.`}>
              Never runs: rule {shadowedBy + 1} matches first
            </Tag>
          ) : null}
          {problems > 0 ? (
            <Tag tone="error" icon="warning">
              {problems} {problems === 1 ? 'problem' : 'problems'}
            </Tag>
          ) : null}
        </div>
        <div className={styles.actions}>
          <IconButton icon="copy" label={`Duplicate rule ${index + 1}`} size="sm" variant="quiet" onClick={onDuplicate} />
          <IconButton icon="trash" label={`Delete rule ${index + 1}`} size="sm" variant="quiet" onClick={onDelete} />
        </div>
      </div>
      <div id={bodyId} className={styles.body} hidden={!open}>
        <ChaosRuleFields rule={rule} errors={errors} onChange={onChange} />
      </div>
    </li>
  )
}
