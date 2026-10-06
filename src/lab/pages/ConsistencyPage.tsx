import { useQueryClient } from '@tanstack/react-query'
import { useLabSetting } from '@/lib'
import { useLabTruth } from '@/lib/queries'
import { ErrorState, FieldNotes, PageHeader, ProvenanceChip } from '@/ui'
import { ConsistencyActions, type DispatchChoice } from '../components/ConsistencyActions'
import { useBadgeAsked } from '../components/ConsistencyBadge'
import { ConsistencyDispatchTable } from '../components/ConsistencyDispatchTable'
import { ConsistencyInboxTable } from '../components/ConsistencyInboxTable'
import { emptyInbox, serverInboxFacts, type InboxFacts, type Reading } from '../components/ConsistencyModel'
import { ConsistencyPollBar } from '../components/ConsistencyPollBar'
import { DISPATCH_ROWS, readReactDispatches, readReactInbox, useQueryCacheVersion } from '../components/ConsistencyReact'
import { storageReading } from '../components/ConsistencyStorage'
import { PROBE_INTERVAL_MS, useConsistencyProbe } from '../components/useConsistencyProbe'

const OUTCOME_WORD = { ok: 'ok', 'not-implemented': 'not wired', error: 'failed' } as const

export default function ConsistencyPage() {
  const qc = useQueryClient()
  const showProvenance = useLabSetting('showProvenance')
  useQueryCacheVersion(qc)

  // React is read straight from the cache on every render; the version hook above is what makes that re-render happen.
  const reactInbox = readReactInbox(qc)
  const rows = readReactDispatches(qc)
  const probe = useConsistencyProbe(rows.map((r) => r.id))
  const truth = useLabTruth({ pollMs: probe.paused ? 0 : PROBE_INTERVAL_MS })
  const { asked, info } = useBadgeAsked()

  // While a failed poll is retrying, the query has no `error` yet (and each new poll clears it); `failureReason` is what has gone wrong so far.
  const truthError = truth.error ?? truth.failureReason
  const server: Reading<InboxFacts> = truth.data
    ? { status: 'ok', value: serverInboxFacts(truth.data), at: Date.parse(truth.data.asOf) }
    : truthError
      ? { status: 'unavailable', note: truthError.userMessage }
      : { status: 'pending' }
  const storage = storageReading(probe.storage, (ready) => ready.inbox)
  const badge: Reading<InboxFacts> = asked
    ? { status: 'ok', value: { ...emptyInbox, unread: asked.value }, at: asked.at }
    : { status: 'empty', note: 'The app has not asked for a badge yet.' }

  const choices: DispatchChoice[] =
    rows.length > 0 ? rows.map((r) => ({ id: r.id, title: r.title })) : (truth.data?.dispatches.slice(0, DISPATCH_ROWS).map((d) => ({ id: d.id, title: '' })) ?? [])
  const reactAt = rows.length > 0 ? Math.min(...rows.map((r) => r.updatedAt)) : null
  const checkNow = (): void => {
    probe.checkNow()
    void truth.refetch()
  }
  const checkedAt = Math.max(probe.checkedAt ?? 0, truth.dataUpdatedAt) || null

  return (
    <>
      <PageHeader
        eyebrow="Lab / Nº 05 / Consistency"
        title="Consistency inspector"
        description="The same facts, read at four layers: what the server holds, what React Query holds, what Cache Storage holds, and what the badge was last told. Whichever copy is lying shows up as a mismatch."
        meta={showProvenance ? <ProvenanceChip meta={truth.meta} /> : null}
      />
      <FieldNotes
        experiments={[
          <>Open the Inbox and the Log once so React has something to show. Back here, press <strong>Change behind React&apos;s back</strong>: the server&apos;s revision moves, React&apos;s does not, and the row turns to Mismatch.</>,
          <>Press <strong>Heal</strong>. React catches up; Cache Storage only does if your worker revalidates, so that column keeps its old revision.</>,
          <>Switch the field to Read and change a dispatch. The unread count falls on the server, React keeps its own, and the badge holds what React last told it.</>,
          <>Spawn a wire dispatch. feedRev moves on the server first, then in the inbox summary and the feed page once they refetch.</>,
        ]}
      >
        A PWA keeps every fact in several places with separate clocks: the server, React Query&apos;s memory, the service worker&apos;s Cache Storage and the app badge. Each place is right when
        it was written and wrong by the time it is read. This page reads all four every three seconds and says which one differs and why it probably does.
      </FieldNotes>

      {truthError ? <ErrorState compact={truth.data !== undefined} error={truthError} onRetry={() => void truth.refetch()} retrying={truth.isFetching} /> : null}

      <ConsistencyPollBar paused={probe.paused} onPausedChange={probe.setPaused} checkedAt={checkedAt} onCheckNow={checkNow} />
      <ConsistencyActions choices={choices} readThrough={() => truth.refetch()} readingThrough={truth.isFetching} checkStorage={probe.checkNow} />

      <ConsistencyInboxTable
        server={server}
        react={reactInbox.reading}
        reactDiag={reactInbox.diag}
        storage={storage}
        badge={badge}
        badgeInfo={info}
        badgeNote={asked ? `${asked.feature}, ${OUTCOME_WORD[asked.outcome]}` : null}
        badgeInferred={asked !== null && !asked.exact}
      />
      <ConsistencyDispatchTable rows={rows} truth={truth.data} server={server} storage={probe.storage} reactAt={reactAt} />
    </>
  )
}
