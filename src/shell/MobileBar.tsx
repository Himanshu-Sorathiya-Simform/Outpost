import { useState } from 'react'
import { NavLink } from 'react-router'
import { Drawer, Icon, cx } from '@/ui'
import { FIELD_NAV, TAB_BAR } from './nav-items'
import { FieldNav, LabNav, ZoneSwitch } from './Nav'
import { NavBadge } from './NavBadge'
import { ThemeControl } from './ThemeControl'
import { useZone } from './zone'
import styles from './MobileBar.module.css'

const TABS = TAB_BAR.map((to) => FIELD_NAV.find((i) => i.to === to)).filter((i) => i !== undefined)

/** Phone navigation: four destinations, File dispatch emphasised, and a sheet with everything else. */
export function MobileBar() {
  const [open, setOpen] = useState(false)
  const zone = useZone()
  const close = (): void => setOpen(false)

  return (
    <>
      <nav aria-label="Primary" className={styles.bar}>
        <ul className={styles.tabs}>
          {TABS.map((tab) => (
            <li key={tab.to} className={cx(tab.to === '/file' && styles.file)}>
              <NavLink to={tab.to} className={styles.tab}>
                <span className={styles.glyph}>
                  <Icon name={tab.icon} size={tab.to === '/file' ? 22 : 20} />
                  {tab.badge ? (
                    <span className={styles.badge}>
                      <NavBadge kind={tab.badge} />
                    </span>
                  ) : null}
                </span>
                <span className={styles.name}>{tab.to === '/file' ? 'File' : tab.label}</span>
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" className={styles.tab} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
              <span className={styles.glyph}>
                <Icon name="menu" size={20} />
              </span>
              <span className={styles.name}>More</span>
            </button>
          </li>
        </ul>
      </nav>
      <Drawer open={open} onClose={close} title="Everything" description="Every screen in the field log, and the Lab instruments behind it.">
        <div className={styles.sheet}>
          <ZoneSwitch zone={zone} onNavigate={close} />
          <FieldNav onNavigate={close} />
          <LabNav onNavigate={close} />
          <ThemeControl showLabel />
        </div>
      </Drawer>
    </>
  )
}
