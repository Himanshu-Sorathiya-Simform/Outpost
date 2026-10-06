import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { acquireLabFeed, useLabFeedStore, type FeedStatus } from '@/lib'
import { StatusDot, type StatusTone } from '@/ui'
import { resumeGateLift } from './components/ServerReleaseLift'
import { INSTRUMENTS } from './instruments'
import styles from './LabLayout.module.css'

const FEED: Record<FeedStatus, { tone: StatusTone; label: string }> = {
  connecting: { tone: 'info', label: 'Feed connecting' },
  open: { tone: 'ok', label: 'Feed open' },
  reconnecting: { tone: 'warn', label: 'Feed reconnecting' },
  closed: { tone: 'idle', label: 'Feed closed' },
}

function FeedState() {
  const status = useLabFeedStore((s) => s.status)
  const { tone, label } = FEED[status]
  return (
    <span role="status" aria-live="polite" className={styles.feed}>
      <StatusDot tone={tone} live={status === 'open'} size="sm" label={label} />
    </span>
  )
}

/**
 * Frame for every /lab page: the phosphor accent, the live server feed held open while any instrument is mounted,
 * and a sub-nav of the eleven instruments (the only navigation on a phone, beside the rail on a desktop).
 */
export default function LabLayout() {
  // Same thing useLabFeed() does, without subscribing this layout to every log line the feed receives.
  useEffect(() => acquireLabFeed(), [])
  // A forced upgrade left a deadline behind: any Lab page, not only Server, finishes the job after a reload.
  useEffect(() => {
    resumeGateLift()
  }, [])
  const tabs = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  // On a narrow screen the strip scrolls; keep the current instrument in view after a jump from the rail or a link.
  useEffect(() => {
    tabs.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [pathname])

  return (
    <div className={styles.lab} data-zone="lab">
      <div className={styles.bar}>
        <p className={styles.kicker}>Lab / instruments</p>
        <FeedState />
      </div>
      <nav ref={tabs} aria-label="Instruments" className={styles.tabs}>
        <ul className={styles.list}>
          <li>
            <NavLink to="/lab" end className={styles.tab}>
              <span className={styles.no}>00</span>
              Home
            </NavLink>
          </li>
          {INSTRUMENTS.map((i) => (
            <li key={i.path}>
              <NavLink to={i.path} className={styles.tab}>
                <span className={styles.no}>{String(i.no).padStart(2, '0')}</span>
                {i.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  )
}
