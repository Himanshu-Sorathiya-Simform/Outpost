import { forwardRef, useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { useFieldControl } from './Field'
import { Icon, type IconName } from './icons'
import { cx } from './internal/cx'
import styles from './controls.module.css'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  /** Decorative icon at the start, e.g. "search". */
  leading?: IconName
  /** Anything at the end: a clear button, a unit. */
  trailing?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, leading, trailing, className, ...rest }, ref) {
  const f = useFieldControl({ id: rest.id, invalid, required: rest.required, 'aria-describedby': rest['aria-describedby'] })
  return (
    <div className={cx(styles.control, f.invalid && styles.invalid, className)}>
      {leading ? (
        <span className={styles.adorn}>
          <Icon name={leading} size={16} />
        </span>
      ) : null}
      <input ref={ref} className={styles.native} {...rest} id={f.id} aria-describedby={f['aria-describedby']} aria-invalid={f['aria-invalid']} required={f.required} />
      {trailing ? <span className={styles.trail}>{trailing}</span> : null}
    </div>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
  /** Show a live "n / maxLength" counter. Needs `maxLength`. */
  count?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ invalid, count = false, className, onChange, ...rest }, ref) {
  const f = useFieldControl({ id: rest.id, invalid, required: rest.required, 'aria-describedby': rest['aria-describedby'] })
  const [typed, setTyped] = useState(String(rest.value ?? rest.defaultValue ?? '').length)
  const length = rest.value !== undefined ? String(rest.value).length : typed
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    setTyped(e.target.value.length)
    onChange?.(e)
  }
  const max = rest.maxLength
  return (
    <>
      <div className={cx(styles.control, styles.textareaWrap, f.invalid && styles.invalid, className)}>
        <textarea
          ref={ref}
          className={cx(styles.native, styles.textarea)}
          {...rest}
          id={f.id}
          aria-describedby={f['aria-describedby']}
          aria-invalid={f['aria-invalid']}
          required={f.required}
          onChange={handleChange}
        />
      </div>
      {count && max !== undefined ? (
        <span className={cx(styles.count, length > max * 0.95 && styles.countOver)} aria-hidden="true">
          {String(length).padStart(String(max).length, '0')} / {max}
        </span>
      ) : null}
    </>
  )
})

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
  /** Shorthand for <option> children. */
  options?: SelectOption[]
}

/** A native <select>, restyled. Native so the phone picker and keyboard behaviour come for free. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ invalid, options, className, children, ...rest }, ref) {
  const f = useFieldControl({ id: rest.id, invalid, required: rest.required, 'aria-describedby': rest['aria-describedby'] })
  return (
    <div className={cx(styles.control, f.invalid && styles.invalid, className)}>
      <select ref={ref} className={cx(styles.native, styles.select)} {...rest} id={f.id} aria-describedby={f['aria-describedby']} aria-invalid={f['aria-invalid']} required={f.required}>
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      <span className={styles.chevron}>
        <Icon name="chevron-down" size={16} />
      </span>
    </div>
  )
})
