import { Link } from 'react-router'
import { cx } from '@/ui'
import styles from './SettingsNav.module.css'

export const SECTIONS = [
  { id: 'operator', label: 'Operator' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'install', label: 'Install' },
  { id: 'updates', label: 'App updates' },
  { id: 'background', label: 'Background refresh' },
  { id: 'badge', label: 'Badge' },
  { id: 'storage', label: 'Storage and data' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

/** Sticky local index. Each link is a real hash link, so a section can be shared and the back button works. */
export function SettingsNav({ current }: { current: SectionId }) {
  return (
    <nav className={styles.nav} aria-label="Settings sections">
      <ol className={styles.list}>
        {SECTIONS.map((s, i) => (
          <li key={s.id}>
            <Link to={{ hash: `#${s.id}` }} replace className={cx(styles.link, current === s.id && styles.current)} aria-current={current === s.id ? 'location' : undefined}>
              <span className={styles.num}>{String(i + 1).padStart(2, '0')}</span>
              <span className={styles.label}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}
