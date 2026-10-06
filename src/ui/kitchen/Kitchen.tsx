import { useEffect, useState } from 'react'
import { Icon, Logo, Segmented, StatusDot, Toaster, type IconName } from '@/ui'
import { Actions } from './sections/Actions'
import { DataViews } from './sections/DataViews'
import { Feedback } from './sections/Feedback'
import { Forms } from './sections/Forms'
import { IconSheet } from './sections/IconSheet'
import { Overlays } from './sections/Overlays'
import { Overview } from './sections/Overview'
import styles from './Kitchen.module.css'

type Theme = 'light' | 'dark'
type Density = 'comfortable' | 'compact'
type Zone = 'product' | 'lab'

const NAV: Array<{ id: string; label: string; icon: IconName }> = [
  { id: 'overview', label: 'Overview', icon: 'log' },
  { id: 'actions', label: 'Actions', icon: 'bolt' },
  { id: 'forms', label: 'Forms', icon: 'pen' },
  { id: 'data', label: 'Data', icon: 'query' },
  { id: 'feedback', label: 'Feedback', icon: 'signal' },
  { id: 'overlays', label: 'Overlays', icon: 'window' },
  { id: 'icons', label: 'Icons', icon: 'star' },
]

function initial<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = new URLSearchParams(window.location.search).get(key)
  return allowed.find((a) => a === v) ?? fallback
}

function Controls({ theme, density, zone, set }: { theme: Theme; density: Density; zone: Zone; set: { theme: (v: Theme) => void; density: (v: Density) => void; zone: (v: Zone) => void } }) {
  return (
    <div className={styles.controls}>
      <Segmented<Theme> label="Theme" size="sm" value={theme} onChange={set.theme} options={[{ value: 'light', label: 'Day', icon: 'sun' }, { value: 'dark', label: 'Night', icon: 'moon' }]} />
      <Segmented<Density> label="Density" size="sm" value={density} onChange={set.density} options={[{ value: 'comfortable', label: 'Roomy' }, { value: 'compact', label: 'Tight' }]} />
      <Segmented<Zone> label="Zone" size="sm" value={zone} onChange={set.zone} options={[{ value: 'product', label: 'Product' }, { value: 'lab', label: 'Lab' }]} />
    </div>
  )
}

export function Kitchen() {
  const [theme, setTheme] = useState<Theme>(() => initial('theme', ['light', 'dark'], 'light'))
  const [density, setDensity] = useState<Density>(() => initial('density', ['comfortable', 'compact'], 'comfortable'))
  const [zone, setZone] = useState<Zone>(() => initial('zone', ['product', 'lab'], 'product'))
  const [active, setActive] = useState('overview')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.density = density
  }, [theme, density])

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: '-20% 0px -65% 0px' },
    )
    NAV.forEach((n) => {
      const el = document.getElementById(n.id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  const set = { theme: setTheme, density: setDensity, zone: setZone }
  return (
    <div className={styles.app} data-zone={zone === 'lab' ? 'lab' : undefined}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className={styles.strip} role="status" aria-label="Station telemetry">
        <StatusDot tone="ok" live size="sm" label="Net up" />
        <span>Relay 184 ms</span>
        <span className={styles.stripHide}>SW none</span>
        <span className={styles.stripHide}>v1.0.0 / b9k2</span>
        <span className={styles.stripEnd}>Callsign HALDEN</span>
        <span className={styles.stripHide}>Queue 0</span>
      </div>
      <div className={styles.frame}>
        <nav className={styles.rail} aria-label="Sections">
          <Logo caption="Field dispatch log" size={30} />
          <ol className={styles.nav}>
            {NAV.map((n, i) => (
              <li key={n.id}>
                <a href={`#${n.id}`} className={styles.navLink} aria-current={active === n.id ? 'location' : undefined}>
                  <Icon name={n.icon} size={18} />
                  <span className={styles.navLabel}>{n.label}</span>
                  <span className={styles.navNo}>{String(i).padStart(2, '0')}</span>
                </a>
              </li>
            ))}
          </ol>
          <div className={styles.railControls}>
            <p className="label">Bench controls</p>
            <Controls theme={theme} density={density} zone={zone} set={set} />
          </div>
        </nav>
        <main id="main" className={styles.main}>
          <div className={styles.mobileControls}>
            <Controls theme={theme} density={density} zone={zone} set={set} />
          </div>
          <Overview />
          <Actions />
          <Forms />
          <DataViews />
          <Feedback />
          <Overlays />
          <IconSheet />
        </main>
      </div>
      <Toaster />
    </div>
  )
}
