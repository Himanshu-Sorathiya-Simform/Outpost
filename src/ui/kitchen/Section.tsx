import type { ReactNode } from 'react'
import styles from './Kitchen.module.css'

interface SectionProps {
  id: string
  no: number
  title: string
  lede: string
  children: ReactNode
}

export function Section({ id, no, title, lede, children }: SectionProps) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-h`}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionNo}>{String(no).padStart(2, '0')}</span>
        <div>
          <h2 id={`${id}-h`}>{title}</h2>
          <p className={styles.lede}>{lede}</p>
        </div>
      </header>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  )
}

export function Specimen({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? `${styles.specimen} ${styles.wide}` : styles.specimen}>
      <p className="label">{label}</p>
      <div className={styles.specimenBody}>{children}</div>
    </div>
  )
}
