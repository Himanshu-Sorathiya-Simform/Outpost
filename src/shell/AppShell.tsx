import { Suspense, useEffect, type MouseEvent } from 'react'
import { Link, Outlet, ScrollRestoration, useNavigation } from 'react-router'
import { useBadgeSync } from '@/features/inbox/useBadgeSync'
import { Loader, Logo } from '@/ui'
import { trackLastContact } from './browser-state'
import { OfflineBanner } from './banners/OfflineBanner'
import { SwUpdateToast } from './banners/SwUpdateToast'
import { UpdateBanners } from './banners/UpdateBanners'
import { VersionGate } from './banners/VersionGate'
import { ClockInDialog } from './ClockInDialog'
import { MobileBar } from './MobileBar'
import { FieldNav, LabNav, ZoneSwitch } from './Nav'
import { NavigationProgress } from './NavigationProgress'
import { RouteEffects } from './RouteEffects'
import { TelemetryStrip } from './TelemetryStrip'
import { ThemeControl } from './ThemeControl'
import { useZone, useZoneMemory } from './zone'
import styles from './AppShell.module.css'

function focusMain(e: MouseEvent<HTMLAnchorElement>): void {
  // A plain #main link would push a hash onto the router's history; focusing the landmark does the same job.
  e.preventDefault()
  document.getElementById('main')?.focus()
}

/** The frame around every screen: telemetry strip, rail (desktop) or tab bar (phone), banners, and the page itself. */
export function AppShell() {
  const zone = useZone()
  const navigation = useNavigation()
  useBadgeSync()
  useZoneMemory()
  useEffect(() => trackLastContact(), [])

  return (
    <div className={styles.app} data-zone={zone === 'lab' ? 'lab' : undefined}>
      <a href="#main" className="skip-link" onClick={focusMain}>
        Skip to content
      </a>
      <TelemetryStrip />
      <NavigationProgress />
      <div className={styles.frame}>
        <aside className={styles.rail} aria-label="Sidebar">
          <Link to="/log" className={styles.brand} aria-label="Outpost, field dispatch log. Go to the log">
            <Logo caption="Field dispatch log" size={30} />
          </Link>
          <ZoneSwitch zone={zone} />
          <div className={styles.groups}>
            <FieldNav dense={zone === 'lab'} />
            {zone === 'lab' ? <LabNav dense /> : null}
          </div>
          <div className={styles.controls}>
            <ThemeControl showLabel />
          </div>
        </aside>
        <div className={styles.column}>
          <div className={styles.banners}>
            <OfflineBanner />
            <UpdateBanners />
          </div>
          <main id="main" tabIndex={-1} className={styles.main} aria-busy={navigation.state !== 'idle'}>
            <Suspense
              fallback={
                <div className={styles.pending}>
                  <Loader />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      <MobileBar />
      <RouteEffects />
      <ScrollRestoration getKey={(location) => location.pathname} />
      <ClockInDialog />
      <VersionGate />
      <SwUpdateToast />
    </div>
  )
}
