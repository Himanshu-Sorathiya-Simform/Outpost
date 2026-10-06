import { Loader, Skeleton } from '@/ui'
import styles from './LogSkeleton.module.css'

const ROWS = 6

/** Ruled blank lines where the register will be, under a signal-bars loader that announces the wait. */
export function LogSkeleton() {
  return (
    <div className={styles.wrap} aria-busy="true">
      <Loader label="Receiving the log" />
      <ul className={styles.list} aria-hidden="true">
        {Array.from({ length: ROWS }, (_, i) => (
          <li key={i} className={styles.row}>
            <Skeleton variant="block" height="3.5rem" />
            <div className={styles.text}>
              <Skeleton width="40%" />
              <Skeleton variant="title" width="80%" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
