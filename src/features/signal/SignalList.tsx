import { Link } from 'react-router'
import { StatusDot } from '@/ui'
import { STATUS_LABEL, STATUS_TONE } from '@/features/stations/stations'
import { hasCarrier } from './signal'
import type { SignalLedgerProps } from './SignalLedger'
import styles from './SignalList.module.css'

/** The narrow-screen form of the readings: one entry per station, the six figures in a grid under its code. */
export function SignalList({ readings }: Pick<SignalLedgerProps, 'readings'>) {
  return (
    <ul className={styles.list} aria-label="Readings per station">
      {readings.map((r) => {
        const carrier = hasCarrier(r)
        const figures: Array<[string, string]> = [
          ['RSSI', carrier ? `${r.rssiDbm.toFixed(0)} dBm` : '—'],
          ['SNR', carrier ? `${r.snrDb.toFixed(1)} dB` : '—'],
          ['Latency', carrier ? `${Math.round(r.latencyMs)} ms` : '—'],
          ['Battery', `${r.batteryPct.toFixed(0)}%`],
          ['Temp', `${r.tempC.toFixed(1)} °C`],
          ['Wind', `${r.windKph.toFixed(0)} km/h`],
        ]
        return (
          <li key={r.stationId} className={styles.entry}>
            <p className={styles.head}>
              <Link to={`/stations/${encodeURIComponent(r.stationCode)}`} className={styles.code}>
                {r.stationCode}
              </Link>
              <StatusDot tone={STATUS_TONE[r.status]} label={STATUS_LABEL[r.status]} size="sm" />
            </p>
            <dl className={styles.figures}>
              {figures.map(([label, value]) => (
                <div key={label} className={styles.cell}>
                  <dt className={styles.label}>{label}</dt>
                  <dd className={styles.value}>{value === '—' ? <span role="img" aria-label="no carrier">{value}</span> : value}</dd>
                </div>
              ))}
            </dl>
          </li>
        )
      })}
    </ul>
  )
}
