import type { Station } from '@shared/contracts'
import { KeyValue, StatusDot, TimeAgo, formatStamp } from '@/ui'
import { formatCoords } from './LocatorMap'
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE, formatElevation } from './stations'

export function StationFacts({ station }: { station: Station }) {
  return (
    <KeyValue
      items={[
        { label: 'Code', value: station.code },
        { label: 'Status', value: <StatusDot tone={STATUS_TONE[station.status]} label={STATUS_LABEL[station.status]} />, mono: false },
        { label: 'Region', value: station.region },
        { label: 'Kind', value: KIND_LABEL[station.kind] },
        { label: 'Crew', value: station.crew },
        { label: 'Elevation', value: formatElevation(station.elevationM) },
        { label: 'Position', value: formatCoords(station.lat, station.lng) },
        {
          label: 'Last contact',
          value: (
            <>
              <TimeAgo at={station.lastContactAt} /> ({formatStamp(station.lastContactAt)})
            </>
          ),
        },
        { label: 'Register revision', value: station.rev },
      ]}
    />
  )
}
