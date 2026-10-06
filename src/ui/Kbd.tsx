import { Fragment } from 'react'
import { cx } from './internal/cx'
import styles from './Kbd.module.css'

export interface KbdProps {
  /** One key, or a chord: `keys={['Ctrl', 'Shift', 'R']}` renders three caps joined by "+". */
  keys: string | string[]
  className?: string
}

export function Kbd({ keys, className }: KbdProps) {
  const list = Array.isArray(keys) ? keys : [keys]
  return (
    <span className={cx(styles.group, className)}>
      {list.map((k, i) => (
        <Fragment key={`${k}-${i}`}>
          {i > 0 ? (
            <span className={styles.plus} aria-hidden="true">
              +
            </span>
          ) : null}
          <kbd className={styles.key}>{k}</kbd>
        </Fragment>
      ))}
    </span>
  )
}
