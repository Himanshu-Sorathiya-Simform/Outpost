import { Link } from 'react-router'
import { StatusDot, TimeAgo } from '@/ui'
import { ChangedStamp } from './ChangedStamp'
import { StationThumb } from './StationThumb'
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE, formatElevation } from './stations'
import type { StationsListProps } from './StationsTable'
import styles from './StationRegister.module.css'

/** The narrow-screen form of the ledger: one stacked register entry per station. */
export function StationRegister({ stations, changes, batch }: Omit<StationsListProps, 'view'>) {
  return (
    <ul className={styles.list} aria-label="Stations on the register">
      {stations.map((s) => {
        const reasons = changes.get(s.id)
        return (
          <li key={s.id} className={styles.entry} data-changed={reasons ? '' : undefined}>
            <StationThumb code={s.code} />
            <div className={styles.body}>
              <p className={styles.head}>
                <Link to={`/stations/${encodeURIComponent(s.code)}`} className={styles.code}>
                  {s.code}
                </Link>
                <StatusDot tone={STATUS_TONE[s.status]} label={STATUS_LABEL[s.status]} size="sm" />
              </p>
              <p className={styles.name}>{s.name}</p>
              <p className={styles.line}>
                {s.region}, {KIND_LABEL[s.kind].toLowerCase()}
              </p>
              <p className={styles.line}>
                Crew {s.crew}, {formatElevation(s.elevationM)}, contact <TimeAgo at={s.lastContactAt} />
              </p>
              {reasons ? <ChangedStamp key={`${batch}-${s.id}`} reasons={reasons} /> : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
