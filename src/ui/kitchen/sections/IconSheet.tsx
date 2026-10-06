import { ICON_NAMES, Icon } from '@/ui'
import { Section } from '../Section'
import styles from './IconSheet.module.css'

export function IconSheet() {
  return (
    <Section id="icons" no={6} title="Icons" lede={`${ICON_NAMES.length} symbols on a 20px grid, 1.5px stroke, flat caps, mitred joins. Shown at 20 and 32px.`}>
      <ul className={styles.sheet}>
        {ICON_NAMES.map((n) => (
          <li key={n} className={styles.cell}>
            <span className={styles.glyphs}>
              <Icon name={n} size={20} />
              <Icon name={n} size={32} />
            </span>
            <span className={styles.name}>{n}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}
