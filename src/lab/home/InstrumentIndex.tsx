import { Link } from 'react-router'
import { Icon, Plate, Tag } from '@/ui'
import { INSTRUMENTS } from '../instruments'
import { useInstrumentTags } from './useInstrumentTags'
import styles from './LabHome.module.css'

/** The eleven instruments as numbered ledger entries, each with whatever the page already knows about its state. */
export function InstrumentIndex() {
  const tags = useInstrumentTags()
  return (
    <Plate index="Nº 0002" title="Instruments" flush>
      <ol className={styles.index}>
        {INSTRUMENTS.map((i) => (
          <li key={i.path} className={styles.entry}>
            <span className={styles.entryNo} aria-hidden="true">
              {String(i.no).padStart(2, '0')}
            </span>
            <div className={styles.entryBody}>
              <Link to={i.path} className={styles.entryLink}>
                <Icon name={i.icon} size={18} />
                {i.label}
              </Link>
              <p className={styles.entryPurpose}>{i.purpose}</p>
            </div>
            <div className={styles.entryTags}>
              {(tags[i.path] ?? []).map((t) => (
                <Tag key={t.text} tone={t.tone}>
                  {t.text}
                </Tag>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </Plate>
  )
}
