import { Link } from 'react-router'
import type { SignalReading } from '@shared/contracts'
import { Meter, Sparkline, StatusDot, Table, TBody, Td, THead, Th, Tr } from '@/ui'
import { STATUS_LABEL, STATUS_TONE } from '@/features/stations/stations'
import { batteryLevel, hasCarrier, rssiLevel, rssiPercent } from './signal'
import styles from './SignalLedger.module.css'

export interface SignalLedgerProps {
  readings: readonly SignalReading[]
  latency: Readonly<Record<string, number[]>>
}

const Dash = () => (
  <span className={styles.dash} role="img" aria-label="no carrier">
    {'\u2014'}
  </span>
)

export function SignalLedger({ readings, latency }: SignalLedgerProps) {
  return (
    <Table caption="Readings per station" captionHidden minWidth={900} dense>
      <THead>
        <Tr>
          <Th>Station</Th>
          <Th>Status</Th>
          <Th>RSSI</Th>
          <Th numeric>SNR</Th>
          <Th>Latency</Th>
          <Th>Battery</Th>
          <Th numeric>Temp</Th>
          <Th numeric>Wind</Th>
        </Tr>
      </THead>
      <TBody>
        {readings.map((r) => {
          const carrier = hasCarrier(r)
          return (
            <Tr key={r.stationId}>
              <Td nowrap>
                <Link to={`/stations/${encodeURIComponent(r.stationCode)}`} className={styles.code}>
                  {r.stationCode}
                </Link>
              </Td>
              <Td nowrap>
                <StatusDot tone={STATUS_TONE[r.status]} label={STATUS_LABEL[r.status]} />
              </Td>
              <Td nowrap>
                {carrier ? (
                  <div className={styles.meterCell}>
                    <span className={styles.figure}>{r.rssiDbm.toFixed(0)} dBm</span>
                    <Meter label={`${r.stationCode} signal strength`} value={rssiPercent(r.rssiDbm)} hideHeader size="sm" segments={10} tone={rssiLevel(r.rssiDbm)} valueText={`${r.rssiDbm.toFixed(0)} dBm`} />
                  </div>
                ) : (
                  <Dash />
                )}
              </Td>
              <Td numeric nowrap>
                {carrier ? `${r.snrDb.toFixed(1)} dB` : <Dash />}
              </Td>
              <Td nowrap>
                <div className={styles.latencyCell}>
                  <span className={styles.figure}>{carrier ? `${Math.round(r.latencyMs)} ms` : <Dash />}</span>
                  <Sparkline values={latency[r.stationCode] ?? []} width={84} height={22} label={`${r.stationCode} latency`} />
                </div>
              </Td>
              <Td nowrap>
                <div className={styles.meterCell}>
                  <span className={styles.figure}>{r.batteryPct.toFixed(0)}%</span>
                  <Meter label={`${r.stationCode} battery`} value={r.batteryPct} hideHeader size="sm" segments={10} tone={batteryLevel(r.batteryPct)} valueText={`${r.batteryPct.toFixed(0)}%`} />
                </div>
              </Td>
              <Td numeric nowrap>
                {r.tempC.toFixed(1)} °C
              </Td>
              <Td numeric nowrap>
                {r.windKph.toFixed(0)} km/h
              </Td>
            </Tr>
          )
        })}
      </TBody>
    </Table>
  )
}
