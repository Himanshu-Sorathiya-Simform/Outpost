import { FieldNotes, PageHeader } from '@/ui'
import { EnvCapabilityMatrix } from '../components/EnvCapabilityMatrix'
import { EnvManifest } from '../components/EnvManifest'
import { EnvRuntimeFacts } from '../components/EnvRuntimeFacts'
import { EnvStorage } from '../components/EnvStorage'

export default function EnvironmentPage() {
  return (
    <>
      <PageHeader
        eyebrow="Lab / Nº 01"
        title="Environment"
        description="What this browser can do, how the page is being shown, what the manifest promises, and how much room is left."
      />
      <FieldNotes
        experiments={[
          <>Open this page in a private window, then in a normal one. Compare the storage quota and the permission column: the same code reports different worlds.</>,
          <>Browse to the site by its LAN address (http://192.168.x.x:4000) from your phone. The secure-context row goes red and the service worker, cache and push rows go missing.</>,
          <>Add a manifest link to <code>index.html</code>, reload, and watch the checklist turn from an empty page into a list of verdicts. Break start_url on purpose and reload.</>,
          <>Press &quot;Request persistent storage&quot; before and after installing the app. The answer is the browser&apos;s, not yours.</>,
        ]}
      >
        Nothing on this page registers or changes anything; it reads what the browser exposes. Every capability is feature-detected, so a missing API is a row that says so rather than an error. The manifest is
        fetched fresh each time, bypassing the HTTP cache, because a manifest served with a long max-age is one of the ways a change never reaches users.
      </FieldNotes>
      <EnvCapabilityMatrix />
      <EnvRuntimeFacts />
      <EnvManifest />
      <EnvStorage />
    </>
  )
}
