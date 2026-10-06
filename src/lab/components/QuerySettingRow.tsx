import { useState } from 'react'
import { useLabSettings, type LabSettingValues } from '@/lib'
import { Field, Input, Segmented, Switch, Tag } from '@/ui'
import type { NumberDef, SettingDef } from './QuerySettingsDefs'
import styles from './QuerySettingRow.module.css'

const set = (patch: Partial<LabSettingValues>): void => useLabSettings.getState().set(patch)

/** A number that is only written when it is a whole number inside its range: the store would otherwise silently swap a bad value for the default. */
function NumberControl({ def, value }: { def: NumberDef; value: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(value)
  const parsed = Number(shown)
  const valid = shown.trim() !== '' && Number.isInteger(parsed) && parsed >= def.min && parsed <= def.max
  return (
    <Field label={def.label} labelHidden error={draft !== null && !valid ? `Whole number from ${def.min} to ${def.max}` : undefined}>
      <Input
        type="number"
        inputMode="numeric"
        min={def.min}
        max={def.max}
        step={1}
        value={shown}
        trailing={def.unit}
        onChange={(e) => {
          setDraft(e.target.value)
          const next = Number(e.target.value)
          if (e.target.value.trim() !== '' && Number.isInteger(next) && next >= def.min && next <= def.max) set({ [def.key]: next })
        }}
        onBlur={() => setDraft(null)}
      />
    </Field>
  )
}

export interface QuerySettingRowProps {
  def: SettingDef
  value: LabSettingValues[SettingDef['key']]
  /** For the persist row: what the setting said when the page loaded. */
  loadedWith?: boolean
}

/** One setting: its label and control on the left, what it does to a PWA on the right. */
export function QuerySettingRow({ def, value, loadedWith }: QuerySettingRowProps) {
  const control = (() => {
    switch (def.kind) {
      case 'number':
        return <NumberControl def={def} value={Number(value)} />
      case 'switch':
        return <Switch label={def.label} checked={value === true} onChange={(checked) => set({ [def.key]: checked })} />
      case 'choice':
        return <Segmented size="sm" label={def.label} showLabel options={def.options} value={String(value)} onChange={(v) => set({ [def.key]: v })} />
    }
  })()
  const pending = def.key === 'persistQueryCache' && loadedWith !== undefined && loadedWith !== (value === true)
  return (
    <li className={styles.row}>
      <div className={styles.control}>
        {def.kind === 'number' ? <span className={styles.name}>{def.label}</span> : null}
        {control}
        {def.onReload ? (
          <Tag tone={pending ? 'warn' : 'neutral'} icon="refresh">
            {pending ? 'changed, reload to apply' : 'applies on reload'}
          </Tag>
        ) : null}
      </div>
      <p className={styles.explain}>{def.explain}</p>
    </li>
  )
}
