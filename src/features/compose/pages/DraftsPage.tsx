import { FieldNotes, PageHeader } from '@/ui'
import { ConnectivityStrip } from '../components/ConnectivityStrip'
import { LocalDraftsPlate } from '../drafts/LocalDraftsPlate'
import { OutboxPlate } from '../outbox/OutboxPlate'
import { useOutbox } from '../outbox/useOutbox'
import styles from './DraftsPage.module.css'

/** Drafts on this device, and the outbox the service worker is meant to manage. Two lists, because they are two different promises. */
export default function DraftsPage() {
  const outbox = useOutbox()
  return (
    <>
      <PageHeader
        eyebrow="Register / Drafts"
        title="Drafts and outbox"
        description="What has been written but not filed, and what is waiting for a signal."
        meta={<ConnectivityStrip context="drafts" />}
      />
      <div className={styles.split}>
        <LocalDraftsPlate outbox={outbox.state} />
        <OutboxPlate outbox={outbox} />
      </div>
      <FieldNotes
        title="Two lists, two promises"
        experiments={[
          'Lab, then Chaos, then Hard down: file a dispatch. It comes back here as Not sent, and keeps the key it was first given.',
          'Open the same draft in two tabs and send it from both. The second answer is "Already filed": the key made it the same filing, not a duplicate.',
          'Implement queueDispatch and listQueued in src/pwa/sync.ts, then file while offline. The dispatch moves to the outbox and a sync event sends it.',
        ]}
      >
        <p>
          <strong>On this device</strong> is ordinary browser storage. Drafts sit there because you typed them or because a send failed. Nothing sends them on
          its own: only you, with Send now.
        </p>
        <p>
          <strong>Outbox</strong> is managed by the service worker. <em>Queued</em> means the worker has promised to send the dispatch when the network returns,
          even if this tab is closed by then. Until a worker is registered, that list stays empty.
        </p>
      </FieldNotes>
    </>
  )
}
