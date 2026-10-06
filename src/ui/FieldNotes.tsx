import { useId, useState, type ReactNode } from 'react'
import { Icon } from './icons'
import { cx } from './internal/cx'
import styles from './FieldNotes.module.css'

export interface FieldNotesProps {
  /** Block heading. Default "Field notes". */
  title?: string
  /** What you are looking at: two to four sentences. */
  children: ReactNode
  /** Concrete things to try, in order. Each is a sentence or two. */
  experiments?: ReactNode[]
  /** Section label above the experiments. Default "Try". */
  experimentsLabel?: string
  defaultOpen?: boolean
  className?: string
}

/** The Lab's learning surface: a margin-note block with a short explainer and numbered experiments. */
export function FieldNotes({ title = 'Field notes', children, experiments, experimentsLabel = 'Try', defaultOpen = true, className }: FieldNotesProps) {
  const id = useId()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <aside className={cx(styles.notes, className)} aria-labelledby={`${id}-h`}>
      <button type="button" className={styles.head} aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)}>
        <span className={styles.tab} aria-hidden="true">
          <Icon name="pen" size={14} />
        </span>
        <span id={`${id}-h`} className={styles.title}>
          {title}
        </span>
        <span className={styles.toggle}>{open ? 'Hide' : 'Show'}</span>
      </button>
      <div id={`${id}-body`} className={styles.body} hidden={!open}>
        <div className={styles.lede}>{children}</div>
        {experiments && experiments.length > 0 ? (
          <div className={styles.try}>
            <p className={styles.tryLabel}>{experimentsLabel}</p>
            <ol className={styles.list}>
              {experiments.map((e, i) => (
                <li key={i} className={styles.item}>
                  {e}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
