import { Icon } from '@/ui'
import styles from './EditionWarning.module.css'

export interface EditionWarningProps {
  chapterEdition: string
  indexEdition: string
}

/** Two answers from different releases on one screen. Only a partly updated cache can produce this, so it is worth saying. */
export function EditionWarning({ chapterEdition, indexEdition }: EditionWarningProps) {
  return (
    <div className={styles.box} role="status">
      <p className={styles.title}>
        <Icon name="warning" size={16} />
        Editions do not match
      </p>
      <p className={styles.text}>
        This chapter is from edition {chapterEdition}; the index is edition {indexEdition}. One of them is a stored copy from another release, so the chapter numbers, titles and the text itself may
        disagree. Refresh the page to fetch both again.
      </p>
    </div>
  )
}
