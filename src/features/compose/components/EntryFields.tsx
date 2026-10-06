import { useMemo } from 'react'
import type { Severity } from '@shared/contracts'
import { Field, Input, Segmented, Textarea, cx } from '@/ui'
import { LIMITS, type FormValues } from '../form/form-values'
import type { FieldErrors, FieldKey } from '../form/validate'
import { CoordsFields } from './CoordsFields'
import { StationPicker } from './StationPicker'
import { TagInput } from './TagInput'
import styles from './EntryFields.module.css'

export type FieldRefs = Partial<Record<FieldKey, HTMLElement | null>>

export interface FieldGroupProps {
  values: FormValues
  errors: FieldErrors
  onEdit: (patch: Partial<FormValues>, touched: FieldKey) => void
  /** Where each control registers itself, so the form can focus the first one in error. */
  refs: { current: FieldRefs }
}

const SEVERITY_OPTIONS: Array<{ value: Severity; label: string }> = [
  { value: 'routine', label: 'Routine' },
  { value: 'notice', label: 'Notice' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'critical', label: 'Critical' },
]

function Counter({ length, max, min }: { length: number; max: number; min?: number }) {
  const over = length > max
  const short = min !== undefined && length > 0 && length < min
  return (
    <span className={cx(styles.counter, (over || short) && styles.counterOff)}>
      {length} / {max}
      {over ? `, ${length - max} over` : ''}
    </span>
  )
}

function useRegister(refs: { current: FieldRefs }) {
  return useMemo(() => {
    const make = (key: FieldKey) => (el: HTMLElement | null) => {
      refs.current[key] = el
    }
    return { stationId: make('stationId'), title: make('title'), body: make('body'), tags: make('tags'), coords: make('coords') }
  }, [refs])
}

/** What happened: station, severity, title and body. */
export function EntryFields({ values, errors, onEdit, refs }: FieldGroupProps) {
  const register = useRegister(refs)
  return (
    <div className={styles.group}>
      <Field label="Station" required error={errors.stationId} hint="Where the observation was made.">
        <StationPicker
          value={values.stationId}
          invalid={errors.stationId !== undefined}
          controlRef={register.stationId}
          onChange={(stationId) => onEdit({ stationId }, 'stationId')}
        />
      </Field>
      <Segmented<Severity>
        label="Severity"
        showLabel
        options={SEVERITY_OPTIONS}
        value={values.severity}
        onChange={(severity) => onEdit({ severity }, 'severity')}
      />
      <Field label="Title" required error={errors.title} hint={<Counter length={values.title.length} max={LIMITS.titleMax} min={LIMITS.titleMin} />}>
        <Input
          ref={register.title}
          value={values.title}
          onChange={(e) => onEdit({ title: e.target.value }, 'title')}
          autoComplete="off"
          placeholder="Barometer down 11 hPa in three hours"
        />
      </Field>
      <Field label="Body" required error={errors.body} hint={<Counter length={values.body.length} max={LIMITS.bodyMax} />}>
        <Textarea
          ref={register.body}
          rows={9}
          value={values.body}
          onChange={(e) => onEdit({ body: e.target.value }, 'body')}
          placeholder="What was seen, when, and what is needed."
        />
      </Field>
    </div>
  )
}

/** Its particulars: tags and an optional position. */
export function ParticularsFields({ values, errors, onEdit, refs }: FieldGroupProps) {
  const register = useRegister(refs)
  return (
    <div className={styles.group}>
      <Field label="Tags" error={errors.tags} hint="Enter or comma adds one. Up to 8, 24 characters each.">
        <TagInput ref={register.tags} value={values.tags} invalid={errors.tags !== undefined} onChange={(tags) => onEdit({ tags }, 'tags')} />
      </Field>
      <CoordsFields
        lat={values.lat}
        lng={values.lng}
        error={errors.coords}
        latRef={register.coords}
        onChange={({ lat, lng }) => onEdit({ lat, lng }, 'coords')}
      />
    </div>
  )
}
