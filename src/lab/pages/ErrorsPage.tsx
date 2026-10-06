import { FieldNotes, PageHeader } from '@/ui'
import { ErrorsLedger } from '../components/ErrorsLedger'
import { ErrorsRoutes } from '../components/ErrorsRoutes'
import { ErrorsSimulator } from '../components/ErrorsSimulator'
import { ErrorsViewer } from '../components/ErrorsViewer'

export default function ErrorsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Lab / Nº 10"
        title="Errors"
        description="Every failure in the app is turned into one kind of object and filed in one place. Here is the place, a way to fill it, and a map of who files what."
      />
      <FieldNotes
        experiments={[
          <>Press <em>Drop the socket</em>, then open the new row. Note the source: the query cache filed it, not the button. Now press <em>Start and cancel</em> and see the opposite, a failure the app chooses not to file.</>,
          <>Turn the network off in DevTools and press <em>Answer 503</em>. The caller sees offline or network, never unavailable: with the network off the simulator cannot even arm its rule, so what you see is the offline failure of its setup call. The kind describes what the client could tell, not what you meant.</>,
          <>Press <em>Throw in a timer</em>, then <em>Crash the render box</em>. One reaches the centre through the window handlers, with a toast; the other through a boundary, silently, with a component stack. Same centre, different doors.</>,
          <>Open <em>Route chunk</em> in the full-page failures plate, then use the browser back button. A stale screen is a module-loading problem, and precaching your route chunks is how a service worker would prevent it.</>,
        ]}
      >
        Every request goes through <code>apiFetch</code>, which throws an <code>AppError</code> with a kind: offline, timeout, schema-mismatch and so on. Screens branch on the kind, never on the message. The error centre keeps the
        last two hundred, collapses identical neighbours into one row, and counts per kind. Most of what you press below is real: a rule is armed on the relay for one request and removed again, so what comes back is what a user
        on a bad connection would get. The synthetic tiles exist for failures that need a browser fault or a service worker you have not written yet.
      </FieldNotes>
      <ErrorsViewer />
      <ErrorsSimulator />
      <ErrorsRoutes />
      <ErrorsLedger />
    </>
  )
}
