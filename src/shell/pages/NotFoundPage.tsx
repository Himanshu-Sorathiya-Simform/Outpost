import { Link, useLocation, useNavigate } from 'react-router'
import { Button, Icon, PageHeader, Plate, type IconName } from '@/ui'
import styles from './pages.module.css'

const DESTINATIONS: Array<{ to: string; label: string; icon: IconName; note: string }> = [
  { to: '/log', label: 'Log', icon: 'log', note: 'Every dispatch, newest first.' },
  { to: '/inbox', label: 'Inbox', icon: 'inbox', note: 'What has not been read yet.' },
  { to: '/stations', label: 'Stations', icon: 'station', note: 'Every observation post and its last contact.' },
  { to: '/signal', label: 'Signal', icon: 'signal', note: 'Live readings. Never served from a cache.' },
  { to: '/handbook', label: 'Handbook', icon: 'book', note: 'Operating procedures, readable without a link.' },
  { to: '/file', label: 'File dispatch', icon: 'pen', note: 'Write one up.' },
]

/** The relay answered, and it has nothing under this address. Not the same thing as having no signal (see OfflinePage). */
export default function NotFoundPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <PageHeader
        eyebrow="Nº 404 / Not filed"
        title="Nothing at this address"
        description={
          <>
            There is no page at <code>{pathname}</code>. The app is running and the relay is reachable as far as this page knows; the address is the problem.
          </>
        }
        actions={
          <Button icon="arrow-left" onClick={() => void navigate(-1)}>
            Go back
          </Button>
        }
      />
      <div className={styles.split}>
        <Plate index="Fig. 1" title="Plausible destinations">
          <ul className={styles.ledger}>
            {DESTINATIONS.map((d) => (
              <li key={d.to}>
                <Link to={d.to} className={styles.ledgerLink}>
                  <Icon name={d.icon} size={18} />
                  <span className={styles.ledgerName}>{d.label}</span>
                  <span className={styles.ledgerNote}>{d.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Plate>
        <Plate index="Fig. 2" title="Common causes" surface="sunk">
          <ul className={styles.causes}>
            <li>A link to a dispatch that has since been pruned. The relay keeps the newest 1000.</li>
            <li>A typo in a station code. They look like KRN-07.</li>
            <li>A bookmark from an older version of the app.</li>
          </ul>
        </Plate>
      </div>
    </>
  )
}
