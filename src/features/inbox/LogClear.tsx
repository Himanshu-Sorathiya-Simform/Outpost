import type { ReactNode } from 'react'
import { Icon, LinkButton, TimeAgo } from '@/ui'
import styles from './LogClear.module.css'

export interface LogClearProps {
  /** How many entries are on file, all read. */
  total: number | undefined
  /** When the answer was produced (ISO). */
  asOf: string | undefined
  /** Extra notes: "from a stored copy". */
  children?: ReactNode
}

/** Nothing unread. Drawn as the closing line of a ledger: ruled out, stamped, signed off. */
export function LogClear({ total, asOf, children }: LogClearProps) {
  return (
    <div className={styles.clear}>
      <div className={styles.stamp} aria-hidden="true">
        <Icon name="check" size={28} />
      </div>
      <div className={styles.text}>
        <p className={styles.title}>Log clear</p>
        <p className={styles.body}>
          Nothing unread{total !== undefined ? `. All ${total} entries on file have been read` : ''}
          {asOf ? (
            <>
              , as of <TimeAgo at={asOf} />.
            </>
          ) : (
            '.'
          )}
        </p>
        {children}
        <div className={styles.actions}>
          <LinkButton to="/log" icon="log">
            Read the log
          </LinkButton>
          <LinkButton to="/file" variant="quiet" icon="pen">
            File a dispatch
          </LinkButton>
        </div>
      </div>
      <div className={styles.rules} aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
    </div>
  )
}
