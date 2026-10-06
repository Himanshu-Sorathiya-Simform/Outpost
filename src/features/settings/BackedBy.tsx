import { SeamStatus } from '@/shell'
import styles from './BackedBy.module.css'

export interface BackedByProps {
  /** Seam feature prefix as passed to callSeam ('badge'). */
  feature: string
  /** The src/pwa file the learner writes for this card. */
  file: string
  /** One sentence on what that file has to do. */
  children: string
}

/** The line every PWA-backed card carries: what the card leans on, and whether that file is wired. */
export function BackedBy({ feature, file, children }: BackedByProps) {
  return (
    <div className={styles.row}>
      <p className={styles.text}>
        Backed by <code>{file}</code>. {children}
      </p>
      <SeamStatus feature={feature} label="Seam" />
    </div>
  )
}
