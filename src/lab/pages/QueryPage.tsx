import { FieldNotes, PageHeader } from '@/ui'
import { QueryCache } from '../components/QueryCache'
import { QueryMutations } from '../components/QueryMutations'
import { QueryPersist } from '../components/QueryPersist'
import { QueryReact } from '../components/QueryReact'
import { QuerySettings } from '../components/QuerySettings'

export default function QueryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Lab / Nº 11"
        title="Query"
        description="The cache your screens read from, entry by entry, and every knob that decides how long it is believed."
      />
      <FieldNotes
        experiments={[
          <>Open the log, then come back and find its entry. Invalidate it and watch <em>fetching</em> flicker on and the updated time reset. Do the same with <em>Remove</em> and see that the screen keeps what it drew.</>,
          <>Set <em>Stale time</em> to 3600, open Stations, go to the Log and come back without reloading. The second visit sends nothing, because React says fresh. With a stale-while-revalidate worker in front, it would never get to revalidate either. (A reload empties the memory cache; turn persistence on if you want the copy to survive one.)</>,
          <>Switch network mode to <em>online</em>, press <em>Tell React: offline</em>, then open the inbox. The request never leaves the page. Switch to <em>offlineFirst</em> and it goes out at once.</>,
          <>Turn persistence on, reload, use the app, reload again: the first paint comes from IndexedDB. Then corrupt the record and reload to watch the persister delete it and report what it found.</>,
        ]}
      >
        React Query is a cache that lives in the page. A service worker is a cache that lives beside it. Neither knows about the other, so a request can be answered by one, the other, both or neither, and the data on screen
        can be older than either of them holds. This page shows the page-side cache, live. The table redraws at most four times a second; the chip in an entry&apos;s inspector shows which of the other caches the data last
        came through.
      </FieldNotes>
      <QueryCache />
      <QueryMutations />
      <QuerySettings />
      <QueryPersist />
      <QueryReact />
    </>
  )
}
