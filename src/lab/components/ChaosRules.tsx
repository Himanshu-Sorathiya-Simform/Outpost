import type { ChaosRule } from '@shared/contracts'
import { Button, EmptyState, ErrorState, Plate, Tag } from '@/ui'
import { blankRule, duplicateRule, move, shadowedBy } from './ChaosModel'
import { ChaosRuleCard } from './ChaosRuleCard'
import { ChaosTester } from './ChaosTester'
import type { ChaosDraft } from './useChaosDraft'
import styles from './ChaosRules.module.css'

/** The rule list as data: edit in place, reorder, add, duplicate, delete. Nothing is sent until Apply. */
export function ChaosRules({ draft }: { draft: ChaosDraft }) {
  const rules = draft.state.rules
  const change = (index: number, patch: Partial<ChaosRule>): void => draft.edit((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const actions = (
    <div className={styles.actions}>
      {draft.dirty ? <Tag tone="warn">Unsaved changes</Tag> : null}
      <Button size="sm" variant="ghost" icon="plus" onClick={() => draft.edit((list) => [...list, blankRule(list)])}>
        Add rule
      </Button>
      <Button size="sm" variant="ghost" disabled={!draft.dirty || draft.applying} onClick={draft.revert}>
        Revert
      </Button>
      <Button size="sm" variant="primary" icon="check" loading={draft.applying} disabled={!draft.dirty || draft.problems > 0} onClick={draft.apply}>
        Apply
      </Button>
    </div>
  )

  return (
    <Plate index="Nº 0704" title="Rules" actions={actions}>
      <div className={styles.stack}>
        <p className={styles.lede}>
          <strong>The first enabled rule that matches wins.</strong> Order is priority: a rule lower down never sees a request that a rule above it already matched, however unlikely the upper rule is to fire. Move a rule up to give it the request.
        </p>
        {draft.moved ? (
          <p className={styles.warn} role="alert">
            The server's rules changed while you were editing (a preset, or another tab). Apply will replace them with this list; Revert loads the server's version.
          </p>
        ) : null}
        {draft.problems > 0 ? (
          <p className={styles.warn} role="alert">
            {draft.problems} {draft.problems === 1 ? 'problem' : 'problems'} to fix before Apply is available.
          </p>
        ) : null}
        {draft.applyError ? <ErrorState compact error={draft.applyError} onRetry={draft.apply} retrying={draft.applying} /> : null}
        {rules.length === 0 ? (
          <EmptyState compact icon="bolt" title="No rules">
            Add a rule to break a path on purpose. Or switch on a preset: presets add their stock rule back when it is missing.
          </EmptyState>
        ) : (
          <ol className={styles.list} aria-label="Chaos rules in priority order">
            {rules.map((rule, i) => (
              <ChaosRuleCard
                key={rule.id}
                index={i}
                count={rules.length}
                rule={rule}
                errors={draft.errors[i] ?? {}}
                shadowedBy={shadowedBy(rules, i)}
                onChange={(patch) => change(i, patch)}
                onMove={(delta) => draft.edit((list) => move(list, i, i + delta))}
                onDuplicate={() => draft.edit((list) => [...list.slice(0, i + 1), duplicateRule(rule, list), ...list.slice(i + 1)])}
                onDelete={() => draft.edit((list) => list.filter((_, j) => j !== i))}
              />
            ))}
          </ol>
        )}
        <ChaosTester chaos={draft.state} />
      </div>
    </Plate>
  )
}
