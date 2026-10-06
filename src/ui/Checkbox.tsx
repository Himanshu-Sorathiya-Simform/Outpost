import { forwardRef, useEffect, useId, useImperativeHandle, useRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from './internal/cx'
import styles from './Checkbox.module.css'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> {
  label: ReactNode
  description?: ReactNode
  /** Mixed state for a "select all" header. Purely visual; `checked` still drives the value. */
  indeterminate?: boolean
  invalid?: boolean
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, description, indeterminate = false, invalid, className, id, ...rest }, ref) {
  const auto = useId()
  const inputId = id ?? auto
  const inner = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => inner.current as HTMLInputElement)
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <div className={cx(styles.root, className)}>
      <input
        ref={inner}
        id={inputId}
        type="checkbox"
        className={styles.box}
        aria-invalid={invalid || undefined}
        aria-describedby={description ? `${inputId}-desc` : undefined}
        {...rest}
      />
      <span className={styles.text}>
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
        {description ? (
          <span id={`${inputId}-desc`} className={styles.desc}>
            {description}
          </span>
        ) : null}
      </span>
    </div>
  )
})
