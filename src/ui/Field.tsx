import { createContext, useContext, useId, type ReactNode } from 'react'
import { Icon } from './icons'
import { cx } from './internal/cx'
import controls from './controls.module.css'
import styles from './Field.module.css'

interface FieldContextValue {
  id: string
  describedBy: string | undefined
  invalid: boolean
  required: boolean
}
const FieldContext = createContext<FieldContextValue | null>(null)

/** What a control needs from its surrounding Field: id, aria-describedby, aria-invalid, required. */
export function useFieldControl(own: { id?: string; invalid?: boolean; required?: boolean; 'aria-describedby'?: string }) {
  const ctx = useContext(FieldContext)
  const describedBy = [own['aria-describedby'], ctx?.describedBy].filter(Boolean).join(' ') || undefined
  const invalid = own.invalid ?? ctx?.invalid ?? false
  return {
    id: own.id ?? ctx?.id,
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
    required: own.required ?? ctx?.required,
    invalid,
  }
}

export interface FieldProps {
  label: ReactNode
  /** Help text under the control. */
  hint?: ReactNode
  /** Validation message. Its presence marks the control invalid. */
  error?: ReactNode
  required?: boolean
  /** Hide the label visually (it stays in the accessibility tree). */
  labelHidden?: boolean
  className?: string
  children: ReactNode
}

/** Label, control, hint and error, wired together. Put one Input / Textarea / Select inside. */
export function Field({ label, hint, error, required = false, labelHidden = false, className, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const hasError = error !== undefined && error !== null && error !== false && error !== ''
  const describedBy = [hint ? hintId : null, hasError ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: hasError, required }}>
      <div className={cx(styles.field, className)}>
        <label htmlFor={id} className={cx(controls.fieldLabel, labelHidden && 'sr-only')}>
          {label}
          {required ? (
            <span className={styles.req} aria-hidden="true">
              {' '}
              *
            </span>
          ) : null}
        </label>
        {children}
        {hint ? (
          <p id={hintId} className={styles.hint}>
            {hint}
          </p>
        ) : null}
        <p id={errorId} className={styles.error} aria-live="polite">
          {hasError ? (
            <>
              <Icon name="warning" size={14} />
              <span>{error}</span>
            </>
          ) : null}
        </p>
      </div>
    </FieldContext.Provider>
  )
}
