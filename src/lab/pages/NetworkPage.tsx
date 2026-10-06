import { LinkButton, FieldNotes, PageHeader } from '@/ui'
import { NetworkConsole } from '../components/NetworkConsole'

export default function NetworkPage() {
  return (
    <>
      <PageHeader
        eyebrow="Lab / Nº 06"
        title="Network"
        description="Where did that response come from, and did the server even see it? The client's log and the server's log, joined one row per request."
        actions={
          <LinkButton to="/lab/chaos" icon="bolt" variant="ghost">
            Break something
          </LinkButton>
        }
      />
      <FieldNotes
        experiments={[
          <>Open the Chaos page, switch on <em>Flaky API</em> and fire the probe 20 times. Come back and filter by class CHAOS: the client shows a 500 and the server logged the same request with the rule name on it.</>,
          <>Turn on <em>Hard down</em>. The client rows have no request id, so they are joined by tab, path and time and carry a tilde. That is the heuristic join, and it is how you would tie a failure to a log line in production.</>,
          <>With your service worker serving a page from its cache, look for a CACHE row: the client got an answer, the server logged nothing. A SERVER ONLY row right after it, with no tab id or with this tab&rsquo;s own id, is the worker revalidating in the background: <code>fetch(event.request)</code> forwards the tab id.</>,
          <>Switch the live tail off, open a row, read its headers, then resume. The pill counts what arrived while you were reading.</>,
        ]}
      >
        Every apiFetch call is logged in this tab; the server logs every request it handles, stamped with the request id it sent back. Match the two and each request gets a class: did it reach the relay (NETWORK), was it
        answered by something else (CACHE), did the relay see a request this tab never made (SERVER ONLY), did it die on the way out (PRE-SERVER FAIL), or did a chaos rule touch it. The Resources tab covers what apiFetch never
        sees: scripts, lazy chunks, fonts and images.
      </FieldNotes>
      <NetworkConsole />
    </>
  )
}
