import { FieldNotes, LinkButton, PageHeader } from '@/ui'
import { QueueCallLog } from '../components/QueueCallLog'
import { QueueContract } from '../components/QueueContract'
import { QueueOutbox } from '../components/QueueOutbox'
import { QueueProtocol } from '../components/QueueProtocol'
import { QueueSeamBoard } from '../components/QueueSeamBoard'
import { QueueTabs } from '../components/QueueTabs'

export default function QueuePage() {
  return (
    <>
      <PageHeader
        eyebrow="Lab / Nº 09"
        title="Queue and bridge"
        description="Where the website meets the code you write: the calls it makes, the outbox it expects, the tabs that share it and the messages a worker can send."
        actions={
          <LinkButton to="/lab/worker" icon="worker" variant="ghost">
            Open the worker lab
          </LinkButton>
        }
      />
      <FieldNotes
        experiments={[
          <>Press <em>Probe all seams</em> and read the board. Then implement <code>sync.listQueued</code> and probe again: that tile is the first to turn OK, and the outbox below starts to list.</>,
          <>Pick <em>sync-complete</em> in the protocol tester and send it. The app invalidates the feed, re-reads the outbox and raises a toast, with no worker involved.</>,
          <>Send the invalid template. The message lands in the log marked invalid, with the reason, and the bridge does nothing else with it. That is how an old page should treat a message it does not know.</>,
          <>Open this page in a second tab, send a test invalidate, then run <code>npm run release</code> and reload one tab only. The other one gets a Skew stamp.</>,
        ]}
      >
        The website never touches the service worker, push or sync APIs directly. It calls <code>src/pwa</code> through a wrapper that records every attempt, so this page is both a progress board for your exercises and a log of what the
        app asked for. The second half is the message protocol: the page already listens, validates and reacts, which means you can test your half of it from here before the worker half exists.
      </FieldNotes>
      <QueueSeamBoard />
      <QueueCallLog />
      <QueueOutbox />
      <QueueTabs />
      <QueueProtocol />
      <QueueContract />
    </>
  )
}
