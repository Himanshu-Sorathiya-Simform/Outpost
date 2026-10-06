import { Icon } from '@/ui'
import styles from './FieldNote.module.css'

/** Why this page is network-only, in the operator's voice. Short, and out of the way of the figures. */
export function FieldNote() {
  return (
    <aside className={styles.note} aria-label="Field note">
      <p className={styles.label}>
        <Icon name="pen" size={14} />
        Field note
      </p>
      <p className={styles.text}>
        A live board is the one thing a cache must never answer. A stored copy looks identical to a fresh one, figures and all, and an operator would read a dead link as a healthy one. This
        page compares each answer with the one before, and says so when the link is down instead of keeping quiet.
      </p>
    </aside>
  )
}
