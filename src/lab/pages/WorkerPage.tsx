import { FieldNotes, PageHeader } from '@/ui'
import { WorkerActions } from '../components/WorkerActions'
import { WorkerCompare } from '../components/WorkerCompare'
import { WorkerContract } from '../components/WorkerContract'
import { WorkerMessages } from '../components/WorkerMessages'
import { WorkerRegistrations } from '../components/WorkerRegistrations'
import { WorkerTimeline } from '../components/WorkerTimeline'

export default function WorkerPage() {
  return (
    <>
      <PageHeader
        eyebrow="Lab / Nº 02"
        title="Worker"
        description="Registrations, the lifecycle as it happened, who controls this page, and every message that crossed the line."
      />
      <FieldNotes
        experiments={[
          <>Register your worker, reload, and read the timeline from the top: installing, installed, activating, activated, then the controller appearing. Reload once more and notice which of those steps are missing.</>,
          <>Change one byte of <code>sw.js</code> and press Check for update. A waiting worker appears in the registration card and the update toast turns on. Then read the store plate: the update flag should be on in both columns.</>,
          <>Hard-reload with Shift and press Send ping. The page has no controller, so nothing is sent. The worker is still registered; only this page stopped using it.</>,
          <>Open the site in two tabs and apply an update in one. The other tab stays on the old worker until it closes or the new worker claims it.</>,
        ]}
      >
        A service worker is not one thing but three slots on a registration: installing, waiting and active. A page is controlled by whichever worker was active when it loaded. This page only observes, through
        <code> getRegistrations()</code> and the worker events, and its observer starts at boot so lifecycle steps before you opened it are kept. The second plate compares what <code>usePwaStore</code> says with what the browser says: every mismatch is a bug in your code.
      </FieldNotes>
      <WorkerRegistrations />
      <WorkerCompare />
      <WorkerTimeline />
      <WorkerActions />
      <WorkerMessages />
      <WorkerContract />
    </>
  )
}
