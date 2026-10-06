import { useLabSetting } from '@/lib'
import { useLabState } from '@/lib/queries'
import { EmptyState, ErrorState, FieldNotes, LinkButton, PageHeader, ProvenanceChip, Skeleton } from '@/ui'
import { ServerHeaders } from '../components/ServerHeaders'
import { ServerLabState } from '../components/ServerLabState'
import { ServerPush } from '../components/ServerPush'
import { ServerRelease } from '../components/ServerRelease'
import { ServerRestartBanner } from '../components/ServerRestartBanner'
import { ServerSession } from '../components/ServerSession'
import { ServerWire } from '../components/ServerWire'

export default function ServerPage() {
  const state = useLabState({ pollMs: 5000 })
  const showProvenance = useLabSetting('showProvenance')
  const lab = state.data

  return (
    <>
      <PageHeader
        eyebrow="Lab / Nº 08"
        title="Server"
        description="The relay's own controls: what it files, what version it claims to be, how it caches, when it forgets you, and who it can push to."
        actions={
          <LinkButton to="/lab/chaos" icon="bolt" variant="ghost">
            Break it instead
          </LinkButton>
        }
        meta={showProvenance ? <ProvenanceChip meta={state.meta} /> : null}
      />
      <FieldNotes
        experiments={[
          <>Switch the wire to auto at 5 s, leave the log open and do nothing. Nothing new appears, because nothing asks. Reload and all of it does. That gap is what a service worker has to close.</>,
          <>Publish an update. The tab checks at once, so the banner appears within a moment (a tab that did not publish waits for its next check, or <em>Check now</em>). Then force an upgrade and watch the gate: reloading cannot clear it. It lifts when the timer you chose runs out, or when you open any page under /lab again.</>,
          <>Pick <em>HTTP cache trap</em>, then deploy a new build. The browser keeps serving the old index.html, and the worker file is held back the same way.</>,
          <>Expire the session, then acknowledge a dispatch. This tab still believes in the shift, so the write is a 401 and the clock-in dialog opens.</>,
        ]}
      >
        Everything here changes the relay, not the browser. It keeps its state in memory, so a restart wipes it, and the banner below tells you when that happened. The relay also keeps what your service worker will meet in
        production: a version it can raise, caching headers that can be wrong, sessions that lapse, and a push endpoint that sends real messages to subscribed browsers.
      </FieldNotes>

      <ServerRestartBanner instance={lab?.serverInstance} />

      {state.isPending ? (
        <div role="status" aria-label="Reading the relay's state">
          <Skeleton lines={6} />
        </div>
      ) : lab ? (
        <>
          {state.error ? <ErrorState compact error={state.error} onRetry={() => void state.refetch()} retrying={state.isFetching} /> : null}
          <ServerWire wire={lab.wire} />
          <ServerRelease release={lab.release} />
          <ServerHeaders profile={lab.headerProfile} />
          <ServerSession ttlSec={lab.sessionTtlSec} showProvenance={showProvenance} />
          <ServerPush showProvenance={showProvenance} />
          <ServerLabState state={lab} />
        </>
      ) : state.error ? (
        <ErrorState error={state.error} onRetry={() => void state.refetch()} retrying={state.isFetching} />
      ) : (
        <EmptyState icon="server" title="No state">
          The relay did not report any lab state.
        </EmptyState>
      )}
    </>
  )
}
