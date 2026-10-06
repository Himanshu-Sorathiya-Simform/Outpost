import { Link, NavLink } from 'react-router'
import { INSTRUMENTS } from '@/lab/instruments'
import { Icon } from '@/ui'
import { FIELD_NAV, type NavItem } from './nav-items'
import { NavBadge } from './NavBadge'
import { zoneTarget, type Zone } from './zone'
import styles from './Nav.module.css'

interface NavGroupProps {
  label: string
  items: readonly NavItem[]
  onNavigate?: () => void
  /** Smaller rows, for the group that is not the one you are working in. */
  dense?: boolean
  /** Register number of the first row: the Field group starts at 01, the Lab at 00 (Lab home). */
  first: number
}

function NavGroup({ label, items, onNavigate, dense = false, first }: NavGroupProps) {
  return (
    <nav aria-label={label} className={dense ? styles.dense : undefined}>
      <p className={styles.heading} aria-hidden="true">
        {label}
      </p>
      <ul className={styles.list}>
        {items.map((item, i) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className={styles.link} onClick={onNavigate}>
              <Icon name={item.icon} size={dense ? 16 : 18} />
              <span className={styles.label}>{item.label}</span>
              {item.badge ? (
                <NavBadge kind={item.badge} fallback={<span className={styles.no}>{String(first + i).padStart(2, '0')}</span>} />
              ) : (
                <span className={styles.no}>{String(first + i).padStart(2, '0')}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

const LAB_NAV: readonly NavItem[] = [
  { to: '/lab', label: 'Lab home', icon: 'lab', end: true },
  ...INSTRUMENTS.map((i): NavItem => ({ to: i.path, label: i.label, icon: i.icon })),
]

export function FieldNav({ onNavigate, dense }: Pick<NavGroupProps, 'onNavigate' | 'dense'>) {
  return <NavGroup label="Field" items={FIELD_NAV} onNavigate={onNavigate} dense={dense} first={1} />
}

export function LabNav({ onNavigate, dense }: Pick<NavGroupProps, 'onNavigate' | 'dense'>) {
  return <NavGroup label="Lab" items={LAB_NAV} onNavigate={onNavigate} dense={dense} first={0} />
}

/** Product / Lab. Two links rather than a toggle: each is a place, and the switch remembers where you were in it. */
export function ZoneSwitch({ zone, onNavigate }: { zone: Zone; onNavigate?: () => void }) {
  const zones: Array<{ id: Zone; label: string }> = [
    { id: 'product', label: 'Product' },
    { id: 'lab', label: 'Lab' },
  ]
  return (
    <nav aria-label="Zone" className={styles.zones}>
      {zones.map((z) => (
        <Link key={z.id} to={zoneTarget(z.id)} className={styles.zone} aria-current={zone === z.id ? 'page' : undefined} onClick={onNavigate}>
          {z.label}
        </Link>
      ))}
    </nav>
  )
}
