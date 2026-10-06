import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { cx } from './internal/cx'
import styles from './Tabs.module.css'

export interface TabItem {
  id: string
  label: ReactNode
  icon?: IconName
  /** Small count printed after the label. */
  count?: number | string
  disabled?: boolean
  content: ReactNode
}

export interface TabsProps {
  items: TabItem[]
  /** Controlled selection. Omit for uncontrolled (use `defaultValue`). */
  value?: string
  defaultValue?: string
  onChange?: (id: string) => void
  /** Accessible name of the tab list. */
  label: string
  /** Keep inactive panels mounted (hidden) so their state survives switching. */
  keepMounted?: boolean
  className?: string
}

/** Tabs with automatic activation: arrows, Home and End move and select; Tab enters the panel. */
export function Tabs({ items, value, defaultValue, onChange, label, keepMounted = false, className }: TabsProps) {
  const base = useId()
  const [inner, setInner] = useState(defaultValue ?? items.find((i) => !i.disabled)?.id ?? '')
  const current = value ?? inner
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const select = (id: string): void => {
    if (value === undefined) setInner(id)
    onChange?.(id)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const n = items.length
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    let next = -1
    if (dir !== 0) {
      for (let s = 1; s <= n; s++) {
        const i = (index + dir * s + n * s) % n
        if (!items[i]?.disabled) {
          next = i
          break
        }
      }
    } else if (e.key === 'Home') next = items.findIndex((t) => !t.disabled)
    else if (e.key === 'End') next = n - 1 - [...items].reverse().findIndex((t) => !t.disabled)
    else return
    e.preventDefault()
    const target = items[next]
    if (target) {
      select(target.id)
      refs.current[next]?.focus()
    }
  }

  return (
    <div className={cx(styles.tabs, className)}>
      <div role="tablist" aria-label={label} className={styles.list}>
        {items.map((t, i) => {
          const selected = t.id === current
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              className={cx(styles.tab, selected && styles.on)}
              onClick={() => select(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {t.icon ? <Icon name={t.icon} size={16} /> : null}
              {t.label}
              {t.count !== undefined ? <span className={styles.count}>{t.count}</span> : null}
            </button>
          )
        })}
      </div>
      {items.map((t) => {
        const selected = t.id === current
        if (!selected && !keepMounted) return null
        return (
          <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`} hidden={!selected} tabIndex={0} className={styles.panel}>
            {t.content}
          </div>
        )
      })}
    </div>
  )
}
