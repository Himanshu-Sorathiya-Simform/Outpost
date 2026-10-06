import type { SignalReading } from '@shared/contracts'
import { KeyValue, Meter, StatusDot } from '@/ui'
import { STATUS_LABEL, STATUS_TONE } from '@/features/stations/stations'
import { batteryLevel, hasCarrier, rssiLevel, rssiPercent } from './signal'
import styles from './ReadingFacts.module.css'

const NO_CARRIER = 'none (no carrier)'

/** One station's reading as a ledger list. A dark station shows no carrier figures, never the receiver's floor values. */
export function ReadingFacts({ reading }: { reading: SignalReading }) {
  const carrier = hasCarrier(reading)
  return (
    <KeyValue
      items={[
        { label: 'Link', value: <StatusDot tone={STATUS_TONE[reading.status]} label={STATUS_LABEL[reading.status]} />, mono: false },
        {
          label: 'RSSI',
          value: carrier ? (
            <span className={styles.meterValue}>
              <span>{reading.rssiDbm.toFixed(0)} dBm</span>
              <Meter label="Signal strength" value={rssiPercent(reading.rssiDbm)} hideHeader size="sm" segments={10} tone={rssiLevel(reading.rssiDbm)} valueText={`${reading.rssiDbm.toFixed(0)} dBm`} className={styles.meter} />
            </span>
          ) : (
            NO_CARRIER
          ),
        },
        { label: 'SNR', value: carrier ? `${reading.snrDb.toFixed(1)} dB` : NO_CARRIER },
        { label: 'Latency', value: carrier ? `${Math.round(reading.latencyMs)} ms` : NO_CARRIER },
        {
          label: 'Battery',
          value: (
            <span className={styles.meterValue}>
              <span>{reading.batteryPct.toFixed(0)}%</span>
              <Meter label="Battery" value={reading.batteryPct} hideHeader size="sm" segments={10} tone={batteryLevel(reading.batteryPct)} valueText={`${reading.batteryPct.toFixed(0)}%`} className={styles.meter} />
            </span>
          ),
        },
        { label: 'Temperature', value: `${reading.tempC.toFixed(1)} °C` },
        { label: 'Wind', value: `${reading.windKph.toFixed(0)} km/h` },
      ]}
    />
  )
}
