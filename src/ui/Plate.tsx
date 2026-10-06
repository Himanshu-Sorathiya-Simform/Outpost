import { useId, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from './internal/cx'
import styles from './Plate.module.css'

export interface PlateProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Register number: `142` renders "Nº 0142"; a string is printed as given ("Fig. 3"). */
  index?: number | string
  title?: ReactNode
  titleAs?: 'h2' | 'h3' | 'h4'
  /** Right side of the header: buttons, tags, a ProvenanceChip. */
  actions?: ReactNode
  footer?: ReactNode
  /** No body padding: for tables and lists that run edge to edge. */
  flush?: boolean
  /** Crop marks sit 11px outside the corners; keep a gap of at least 16px between plates. */
  marks?: boolean
  surface?: 'raised' | 'sunk' | 'paper'
  as?: 'section' | 'div' | 'article' | 'aside'
}

const formatIndex = (n: number | string): string => (typeof n === 'number' ? `Nº ${String(n).padStart(4, '0')}` : n)

/** The basic panel: a ruled sheet with crop marks, an optional register number, title and actions. */
export function Plate({ index, title, titleAs: Title = 'h2', actions, footer, flush = false, marks = true, surface = 'raised', as: Tag = 'section', className, children, ...rest }: PlateProps) {
  const titleId = useId()
  const hasHead = index !== undefined || title !== undefined || actions !== undefined
  return (
    <Tag className={cx(styles.plate, styles[surface], className)} aria-labelledby={title !== undefined ? titleId : undefined} {...rest}>
      {marks ? (
        <>
          <i className={cx(styles.mark, styles.tl)} aria-hidden="true" />
          <i className={cx(styles.mark, styles.tr)} aria-hidden="true" />
          <i className={cx(styles.mark, styles.bl)} aria-hidden="true" />
          <i className={cx(styles.mark, styles.br)} aria-hidden="true" />
        </>
      ) : null}
      {hasHead ? (
        <header className={styles.head}>
          <div className={styles.heading}>
            {index !== undefined ? <span className={styles.index}>{formatIndex(index)}</span> : null}
            {title !== undefined ? (
              <Title id={titleId} className={styles.title}>
                {title}
              </Title>
            ) : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx(styles.body, flush && styles.flush)}>{children}</div>
      {footer ? <footer className={styles.foot}>{footer}</footer> : null}
    </Tag>
  )
}
