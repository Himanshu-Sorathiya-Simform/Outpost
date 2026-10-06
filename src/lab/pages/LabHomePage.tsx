import { FieldNotes, PageHeader } from '@/ui'
import { InstrumentIndex } from '../home/InstrumentIndex'
import { LearningPath } from '../home/LearningPath'
import { ServerPlate } from '../home/ServerPlate'

export default function LabHomePage() {
  return (
    <>
      <PageHeader
        eyebrow="Lab / Overview"
        title="The instruments"
        description="Eleven instruments that show what the site does with its caches, its requests and its errors. The product never depends on them. The accent turns green in here so you always know which side you are on."
      />
      <FieldNotes
        experiments={[
          <>Open Chaos and switch on <strong>Hard down</strong>, then come back. The relay state below keeps updating, because lab requests are never faulted.</>,
          <>Open this page in two tabs. The Queue instrument counts both, and each tab reports what controls it.</>,
          <>Tick the first exercise once your worker shows <code>sw active</code> in the strip at the top. Ticks stay in this browser only.</>,
        ]}
      >
        Everything in Outpost is an ordinary website until you wire the seams in <code>src/pwa</code>. These pages read browser and server state but never write a service worker for you. Each
        instrument below watches one mechanism; the learning path says what to build and where to look.
      </FieldNotes>
      <ServerPlate />
      <InstrumentIndex />
      <LearningPath />
    </>
  )
}
