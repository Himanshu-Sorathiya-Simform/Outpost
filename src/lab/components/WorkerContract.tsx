import { OUTBOX_DB, OUTBOX_STORE, PERIODIC_TAG_DIGEST, SW_BROADCAST_CHANNEL, SYNC_TAG_OUTBOX } from '@shared/sw-protocol'
import { Disclosure, Table, TBody, Td, Th, THead, Tr } from '@/ui'
import stacked from './EnvStacked.module.css'
import styles from './WorkerContract.module.css'

interface Line {
  type: string
  fields: string
  effect: string
}

const TO_PAGE: Line[] = [
  { type: 'cache-updated', fields: 'url, strategy?, cacheName?', effect: 'Invalidates every query whose meta.url matches the path, so a revalidated copy shows up without a reload.' },
  { type: 'sync-complete', fields: 'tag, succeeded[], failed[]', effect: 'Invalidates the dispatch feed and the inbox, re-reads the outbox count and shows a toast.' },
  { type: 'periodic-sync-complete', fields: 'tag, newCount', effect: 'Invalidates the digest and the inbox.' },
  { type: 'navigate', fields: 'url', effect: 'Navigates the router, but only to a same-origin URL. Anything else is ignored and the log says so.' },
  { type: 'push-received', fields: 'payload (PushPayload)', effect: 'Invalidates the inbox and shows a toast with an Open action, unless the push is silent.' },
  { type: 'sw-version', fields: 'version, caches?', effect: 'Logged only. The usual reply to get-version, and worth sending on activate.' },
  { type: 'log', fields: 'level (debug, info, warn, error), message', effect: 'Logged only. A way to get console lines out of a worker you cannot easily attach to.' },
]

const TO_WORKER: Line[] = [
  { type: 'skip-waiting', fields: 'none', effect: 'Expected to call self.skipWaiting() so a waiting worker activates now.' },
  { type: 'get-version', fields: 'none', effect: 'Expected to answer with sw-version.' },
  { type: 'clear-caches', fields: 'prefix?', effect: 'Expected to delete the caches it owns, or only those starting with prefix.' },
  { type: 'prefetch', fields: 'urls[]', effect: 'Expected to fetch and cache each URL so it works offline.' },
  { type: 'ping', fields: 'nonce', effect: 'Expected to answer so you can time a round trip; nothing in the contract fixes the reply type.' },
]

function Section({ caption, lines }: { caption: string; lines: Line[] }) {
  return (
    <Table caption={caption} dense minWidth={0} className={stacked.stack}>
      <THead>
        <Tr>
          <Th>Type</Th>
          <Th>Fields</Th>
          <Th>What the app does, or expects</Th>
        </Tr>
      </THead>
      <TBody>
        {lines.map((l) => (
          <Tr key={l.type}>
            <Td mono>{l.type}</Td>
            <Td mono className={styles.fields}>
              <span className={stacked.label}>Fields</span>
              {l.fields}
            </Td>
            <Td>
              <span className={stacked.label}>What the app does, or expects</span>
              {l.effect}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}

/** The page and worker message contract from shared/sw-protocol.ts, written out. */
export function WorkerContract() {
  return (
    <Disclosure summary="Message contract" meta="shared/sw-protocol.ts" variant="boxed">
      <div className={styles.body}>
        <p className={styles.lede}>
          The page side is built: it validates every message with zod, reacts, and logs it above. Unknown types are tolerated and show as invalid. Rename or ignore anything here; the app does not break.
        </p>
        <Section caption="Worker to page (SwToPage)" lines={TO_PAGE} />
        <Section caption="Page to worker (PageToSw)" lines={TO_WORKER} />
        <ul className={styles.names} aria-label="Suggested names">
          <li>Background Sync tag: {SYNC_TAG_OUTBOX}</li>
          <li>Periodic Sync tag: {PERIODIC_TAG_DIGEST}</li>
          <li>
            Outbox: IndexedDB {OUTBOX_DB}, store {OUTBOX_STORE}
          </li>
          <li>BroadcastChannel: {SW_BROADCAST_CHANNEL}</li>
        </ul>
      </div>
    </Disclosure>
  )
}
