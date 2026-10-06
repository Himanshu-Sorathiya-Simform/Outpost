import { useId, type ReactNode } from 'react'
import { cx } from './internal/cx'
import styles from './PageHeader.module.css'

export interface PageHeaderProps {
  title: string
  /** Register line above the title: "Nº 03 / Log", "Lab / Instruments". */
  eyebrow?: ReactNode
  /** One or two sentences under the title. */
  description?: ReactNode
  /** Right side: buttons. */
  actions?: ReactNode
  /** A row under the description: a ProvenanceChip, counts, tags. */
  meta?: ReactNode
  /** Heading level for the title. Default h1. */
  as?: 'h1' | 'h2'
  className?: string
}

/** Page title block: register eyebrow, big condensed title, a measured rule with tick marks under it. */
export function PageHeader({ title, eyebrow, description, actions, meta, as: Heading = 'h1', className }: PageHeaderProps) {
  const id = useId()
  return (
    <header className={cx(styles.header, className)} aria-labelledby={id}>
      <div className={styles.top}>
        <div className={styles.titles}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <Heading id={id} className={styles.title}>
            {title}
          </Heading>
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {description ? <p className={styles.desc}>{description}</p> : null}
      {meta ? <div className={styles.meta}>{meta}</div> : null}
      <span className={styles.ruler} aria-hidden="true" />
    </header>
  )
}
