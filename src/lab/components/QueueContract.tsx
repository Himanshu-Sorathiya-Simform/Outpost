import { OUTBOX_DB, OUTBOX_STORE, PERIODIC_TAG_DIGEST, SW_BROADCAST_CHANNEL, SYNC_TAG_OUTBOX, type OutboxItem } from '@shared/sw-protocol'
import { Disclosure, JsonView, KeyValue, Plate } from '@/ui'
import { PAGE_TO_SW_EXAMPLES, TEMPLATES } from './QueueProtocolTemplates'
import styles from './QueueContract.module.css'

const OUTBOX_EXAMPLE: OutboxItem = {
  id: 'c0ffee12-4d1b-4a6e-9a55-0b7a2e1f3c10',
  createdAt: '2026-01-01T08:15:00.000Z',
  attempts: 1,
  status: 'failed',
  lastError: 'network: Failed to fetch',
  payload: {
    clientId: 'c0ffee12-4d1b-4a6e-9a55-0b7a2e1f3c10',
    stationId: 'st-krn07',
    title: 'Relay mast icing, north face',
    body: 'Ice load estimated at 4 kg per metre. Climbing is off until the wind drops.',
    severity: 'urgent',
    tags: ['icing', 'mast'],
    coords: null,
    filedAtClient: '2026-01-01T08:14:40.000Z',
  },
}

/** The names and shapes the worker and the page agree on, copied from shared/sw-protocol.ts so they can be read next to the tester. */
export function QueueContract() {
  const toPage = TEMPLATES.filter((t) => !t.invalid).map((t) => t.message)
  return (
    <Plate index="Nº 0006" title="Contract reference">
      <Disclosure summary="Tags, database names and message shapes" meta="shared/sw-protocol.ts">
        <div className={styles.body}>
          <div className={styles.group}>
            <h3 className={styles.heading}>Names</h3>
            <KeyValue
              dense
              columns={2}
              items={[
                { label: 'SYNC_TAG_OUTBOX', value: SYNC_TAG_OUTBOX, mono: true },
                { label: 'PERIODIC_TAG_DIGEST', value: PERIODIC_TAG_DIGEST, mono: true },
                { label: 'OUTBOX_DB', value: OUTBOX_DB, mono: true },
                { label: 'OUTBOX_STORE', value: `${OUTBOX_STORE} (keyPath id)`, mono: true },
                { label: 'SW_BROADCAST_CHANNEL', value: SW_BROADCAST_CHANNEL, mono: true },
              ]}
            />
            <p className={styles.note}>These are suggestions. The app only reads the outbox through <code>sync.listQueued</code>, so a different database name works if your seam says so.</p>
          </div>
          <div className={styles.group}>
            <h3 className={styles.heading}>OutboxItem, one record in the store</h3>
            <JsonView value={OUTBOX_EXAMPLE} title="OutboxItem" expandDepth={1} maxHeight={280} />
          </div>
          <div className={styles.group}>
            <h3 className={styles.heading}>SwToPage: worker to page</h3>
            <JsonView value={toPage} title="SwToPage examples" expandDepth={1} maxHeight={320} />
            <p className={styles.note}>Unknown types and malformed fields are kept in the message log as invalid and otherwise ignored, so a worker can add messages without breaking an older page.</p>
          </div>
          <div className={styles.group}>
            <h3 className={styles.heading}>PageToSw: page to worker</h3>
            <JsonView value={PAGE_TO_SW_EXAMPLES} title="PageToSw examples" expandDepth={1} maxHeight={260} />
            <p className={styles.note}>Posted to <code>navigator.serviceWorker.controller</code>. With no controller the send is logged as not sent.</p>
          </div>
        </div>
      </Disclosure>
    </Plate>
  )
}
