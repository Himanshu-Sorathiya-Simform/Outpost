import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from './internal/cx'
import styles from './Switch.module.css'

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'role' | 'aria-checked' | 'children'> {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  /** Second line under the label. */
  description?: ReactNode
  labelHidden?: boolean
}

/** A two-position toggle. The state is printed on the track (ON / OFF), not only coloured. */
export function Switch({ checked, onChange, label, description, labelHidden = false, disabled, className, id, ...rest }: SwitchProps) {
  const auto = useId()
  const btnId = id ?? auto
  const descId = `${btnId}-desc`
  return (
    <div className={cx(styles.root, disabled && styles.disabled, className)}>
      <button
        type="button"
        role="switch"
        id={btnId}
        aria-checked={checked}
        aria-describedby={description ? descId : undefined}
        disabled={disabled}
        className={styles.track}
        onClick={() => onChange(!checked)}
        {...rest}
      >
        <span className={styles.thumb} aria-hidden="true" />
        <span className={styles.state} aria-hidden="true">
          {checked ? 'ON' : 'OFF'}
        </span>
      </button>
      <span className={cx(styles.text, labelHidden && 'sr-only')}>
        <label htmlFor={btnId} className={styles.label}>
          {label}
        </label>
        {description ? (
          <span id={descId} className={styles.desc}>
            {description}
          </span>
        ) : null}
      </span>
    </div>
  )
}
