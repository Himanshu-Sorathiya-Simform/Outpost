import { useId, useRef, type KeyboardEvent } from 'react'
import { Icon, type IconName } from './icons'
import { cx } from './internal/cx'
import controls from './controls.module.css'
import styles from './Segmented.module.css'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: IconName
  disabled?: boolean
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible name of the group. */
  label: string
  /** Also print the label above the group, in the same style as a Field caption. */
  showLabel?: boolean
  size?: 'sm' | 'md'
  block?: boolean
  className?: string
}

/** Single choice from a short list. A radio group: one tab stop, arrow keys move and select. */
export function Segmented<T extends string>({ options, value, onChange, label, size = 'md', block = false, showLabel = false, className }: SegmentedProps<T>) {
  const legendId = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const move = (from: number, step: 1 | -1 | 'first' | 'last'): void => {
    const n = options.length
    let i = from
    for (let tries = 0; tries < n; tries++) {
      i = step === 'first' ? tries : step === 'last' ? n - 1 - tries : (i + step + n) % n
      const opt = options[i]
      if (opt && !opt.disabled) {
        onChange(opt.value)
        refs.current[i]?.focus()
        return
      }
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const keys: Record<string, 1 | -1 | 'first' | 'last'> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'first', End: 'last' }
    const step = keys[e.key]
    if (step === undefined) return
    e.preventDefault()
    move(index, step)
  }

  const group = (
    <div
      role="radiogroup"
      aria-label={showLabel ? undefined : label}
      aria-labelledby={showLabel ? legendId : undefined}
      className={cx(styles.group, size === 'sm' && styles.sm, block && styles.block, !showLabel && className)}
    >
      {options.map((o, i) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={o.disabled}
            className={cx(styles.seg, selected && styles.on)}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.icon ? <Icon name={o.icon} size={size === 'sm' ? 14 : 16} /> : null}
            {o.label}
          </button>
        )
      })}
    </div>
  )

  if (!showLabel) return group
  return (
    <div className={cx(styles.wrap, block && styles.wrapBlock, className)}>
      <span id={legendId} className={controls.fieldLabel}>
        {label}
      </span>
      {group}
    </div>
  )
}
