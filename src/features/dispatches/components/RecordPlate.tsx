import type { Dispatch } from '@shared/contracts'
import type { ResponseMeta } from '@/lib/api/types'
import { KeyValue, Plate, formatStamp, type KeyValueItem } from '@/ui'
import styles from './RecordPlate.module.css'

export interface RecordPlateProps {
  dispatch: Dispatch
  /** Provenance of the copy on screen; undefined when it is not one that came from a detail request. */
  meta: ResponseMeta | undefined
}

const none = <span className={styles.none}>-</span>

/**
 * The bookkeeping behind the page, on purpose. The revision and the validator are what optimistic writes and
 * conditional requests are built on; seeing them move while you star a dispatch is the lesson.
 */
export function RecordPlate({ dispatch: d, meta }: RecordPlateProps) {
  const items: KeyValueItem[] = [
    { label: 'Id', value: d.id },
    { label: 'Revision', value: `r${d.rev}` },
    { label: 'Header rev', value: `r${meta?.rev}`, show: meta?.rev != null && meta.rev !== d.rev },
    { label: 'ETag', value: meta?.etag ?? none },
    { label: 'Client id', value: d.clientId, show: d.clientId !== null },
    { label: 'Filed', value: formatStamp(d.filedAt) },
    { label: 'Served at', value: meta?.servedAt ?? none },
    { label: 'Request id', value: meta?.requestId ?? none },
  ]
  return (
    <Plate index="Rec." title="Record" titleAs="h2" className={styles.plate} footer={<p className={styles.note}>The revision moves whenever anyone reads, stars or acknowledges this dispatch. Writes send it back as If-Match, so a stale copy is refused instead of overwriting.</p>}>
      <KeyValue items={items} dense />
    </Plate>
  )
}
