import { useId, useState, type ReactNode } from 'react'
import { Icon } from './icons'
import { cx } from './internal/cx'
import styles from './Disclosure.module.css'

export interface DisclosureProps {
  summary: ReactNode
  /** Right-aligned secondary text on the summary line (a count, a size). */
  meta?: ReactNode
  defaultOpen?: boolean
  /** Controlled open state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  variant?: 'rule' | 'boxed'
  children: ReactNode
  className?: string
}

/** Show/hide with a real button, aria-expanded and aria-controls. */
export function Disclosure({ summary, meta, defaultOpen = false, open, onOpenChange, variant = 'rule', className, children }: DisclosureProps) {
  const id = useId()
  const [inner, setInner] = useState(defaultOpen)
  const isOpen = open ?? inner
  const toggle = (): void => {
    if (open === undefined) setInner(!isOpen)
    onOpenChange?.(!isOpen)
  }
  return (
    <div className={cx(styles.root, styles[variant], isOpen && styles.open, className)}>
      <button type="button" className={styles.head} aria-expanded={isOpen} aria-controls={id} onClick={toggle}>
        <span className={styles.glyph} aria-hidden="true">
          <Icon name={isOpen ? 'minus' : 'plus'} size={12} />
        </span>
        <span className={styles.summary}>{summary}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </button>
      <div id={id} className={styles.body} hidden={!isOpen}>
        {children}
      </div>
    </div>
  )
}
