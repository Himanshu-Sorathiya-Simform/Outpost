import { Kbd } from '@/ui'
import styles from './KeyLegend.module.css'

/** Which keys work on the list. Hidden on touch-only devices, where there is no keyboard to press. */
export function KeyLegend() {
  return (
    <p className={styles.legend} id="log-key-legend">
      <span className={styles.lead}>With focus in the list</span>
      <span className={styles.item}>
        <Kbd keys="J" /> <Kbd keys="K" /> move
      </span>
      <span className={styles.item}>
        <Kbd keys="Enter" /> open
      </span>
      <span className={styles.item}>
        <Kbd keys="S" /> star
      </span>
      <span className={styles.item}>
        <Kbd keys="R" /> read / unread
      </span>
    </p>
  )
}
