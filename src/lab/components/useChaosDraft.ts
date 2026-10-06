import { useState } from 'react'
import type { ChaosRule, ChaosState } from '@shared/contracts'
import type { AppError } from '@/lib'
import { useUpdateChaos } from '@/lib/queries'
import { errorCount, validateState, type RuleErrors } from './ChaosModel'

interface Draft {
  rules: ChaosRule[]
  /** The saved rules the draft started from, as JSON. A later difference means the server moved under the editor. */
  base: string
}

export interface ChaosDraft {
  /** What the editor shows: the draft's rules while editing, else the saved ones. The switches are always the saved ones. */
  state: ChaosState
  dirty: boolean
  /** The server's rules changed (a preset, another tab) after this draft began. Applying would overwrite that. */
  moved: boolean
  errors: RuleErrors[]
  problems: number
  applying: boolean
  applyError: AppError | null
  edit(change: (rules: ChaosRule[]) => ChaosRule[]): void
  apply(): void
  revert(): void
}

const json = (rules: readonly ChaosRule[]): string => JSON.stringify(rules)

/**
 * Editing buffer for the rule list. Nothing reaches the server until Apply; Revert drops the buffer and shows the
 * server's rules again. The two master switches are live controls and are never part of the buffer, so applying rules
 * cannot undo a switch that was flipped in the meantime.
 */
export function useChaosDraft(saved: ChaosState): ChaosDraft {
  const [draft, setDraft] = useState<Draft | null>(null)
  const update = useUpdateChaos()
  const state: ChaosState = { ...saved, rules: draft?.rules ?? saved.rules }
  const errors = validateState(state)

  return {
    state,
    dirty: draft !== null && json(draft.rules) !== json(saved.rules),
    moved: draft !== null && draft.base !== json(saved.rules),
    errors,
    problems: errorCount(errors),
    applying: update.isPending,
    applyError: update.error,
    edit: (change) => setDraft((d) => ({ rules: change(d?.rules ?? saved.rules), base: d?.base ?? json(saved.rules) })),
    apply: () => {
      if (!draft) return
      update.mutate({ ...saved, rules: draft.rules }, { onSuccess: () => setDraft(null) })
    },
    revert: () => {
      setDraft(null)
      update.reset()
    },
  }
}
