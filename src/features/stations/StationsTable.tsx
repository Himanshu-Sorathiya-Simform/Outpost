import { Link } from 'react-router'
import type { Station } from '@shared/contracts'
import { StatusDot, Table, TBody, Td, THead, TimeAgo, Tr, Th } from '@/ui'
import { ChangedStamp } from './ChangedStamp'
import { StationThumb } from './StationThumb'
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE, formatElevation, type SortKey, type StationChanges } from './stations'
import type { StationView } from './useStationView'
import styles from './StationsTable.module.css'

export interface StationsListProps {
  stations: readonly Station[]
  changes: StationChanges
  batch: number
  view: StationView
}

export function StationsTable({ stations, changes, batch, view }: StationsListProps) {
  const sortProps = (key: SortKey) => ({ sort: view.sort.key === key ? view.sort.dir : ('none' as const), onSort: () => view.setSort(key) })
  return (
    <Table caption="Stations on the register" captionHidden minWidth={860}>
      <THead>
        <Tr>
          <Th>
            <span className="sr-only">Image</span>
          </Th>
          <Th {...sortProps('status')}>Status</Th>
          <Th {...sortProps('code')}>Code</Th>
          <Th {...sortProps('name')}>Name</Th>
          <Th {...sortProps('region')}>Region</Th>
          <Th {...sortProps('kind')}>Kind</Th>
          <Th numeric {...sortProps('crew')}>
            Crew
          </Th>
          <Th numeric {...sortProps('elevation')}>
            Elevation
          </Th>
          <Th {...sortProps('contact')}>Last contact</Th>
        </Tr>
      </THead>
      <TBody>
        {stations.map((s) => {
          const reasons = changes.get(s.id)
          return (
            <Tr key={s.id} flag={reasons ? 'warn' : undefined}>
              <Td>
                <StationThumb code={s.code} />
              </Td>
              <Td nowrap>
                <div className={styles.statusCell}>
                  <StatusDot tone={STATUS_TONE[s.status]} label={STATUS_LABEL[s.status]} />
                  {reasons ? <ChangedStamp key={`${batch}-${s.id}`} reasons={reasons} /> : null}
                </div>
              </Td>
              <Td nowrap>
                <Link to={`/stations/${encodeURIComponent(s.code)}`} className={styles.code}>
                  {s.code}
                </Link>
              </Td>
              <Td>{s.name}</Td>
              <Td>{s.region}</Td>
              <Td nowrap>{KIND_LABEL[s.kind]}</Td>
              <Td numeric>{s.crew}</Td>
              <Td numeric nowrap>
                {formatElevation(s.elevationM)}
              </Td>
              <Td nowrap>
                <TimeAgo at={s.lastContactAt} />
              </Td>
            </Tr>
          )
        })}
      </TBody>
    </Table>
  )
}
