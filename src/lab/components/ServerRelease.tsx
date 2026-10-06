import { useState } from 'react'
import { API_VERSION, type LabState, type ReleasePatch } from '@shared/contracts'
import { checkVersionNow, useVersionStatus, type Skew } from '@/lib'
import { useUpdateRelease } from '@/lib/queries'
import { usePwaStore } from '@/pwa'
import { Button, Plate, StatusDot, Table, TBody, Td, Th, THead, TimeAgo, Tr, type StatusTone, type IconName } from '@/ui'
import stacked from './ServerStacked.module.css'
import { ServerReleaseForce } from './ServerReleaseForce'
import { cancelGateLift } from './ServerReleaseLift'
import { DEFAULT_RELEASE, nextEdition, publishPatch, publishTarget } from './ServerReleaseScenarios'
import { MutationNote } from './ServerMutationNote'
import styles from './ServerRelease.module.css'

const SKEW: Record<Skew, { tone: StatusTone; label: string; effect: string }> = {
  none: { tone: 'ok', label: 'In step', effect: 'This tab runs the newest client the relay knows of. No banner, no gate.' },
  'update-available': { tone: 'info', label: 'Update available', effect: 'The banner "A newer version is out" shows on every page. Nothing is blocked.' },
  'update-required': { tone: 'error', label: 'Update required', effect: 'The version gate covers the whole app until the client is newer than minClient.' },
  'api-mismatch': { tone: 'warn', label: 'API mismatch', effect: 'The relay speaks a different API version than this client was written for.' },
}

interface ScenarioProps {
  icon: IconName
  label: string
  what: string
  onRun: () => void
  disabled: boolean
  variant?: 'ghost' | 'danger'
}

function Scenario({ icon, label, what, onRun, disabled, variant = 'ghost' }: ScenarioProps) {
  return (
    <li className={styles.scenario}>
      <Button size="sm" icon={icon} variant={variant} loading={disabled} onClick={onRun}>
        {label}
      </Button>
      <p className={styles.what}>{what}</p>
    </li>
  )
}

/** Simulates a deploy from the relay's side, then shows what the website makes of it. */
export function ServerRelease({ release }: { release: LabState['release'] }) {
  const { running, server, skew, newDeploy, lastCheckedAt, lastCheckError } = useVersionStatus()
  const swUpdate = usePwaStore((s) => s.updateAvailable)
  const swState = usePwaStore((s) => s.swState)
  const update = useUpdateRelease()
  const [forcing, setForcing] = useState(false)
  const status = SKEW[skew]
  const publishTo = publishTarget(running.version, release.latestClient)
  const edition = nextEdition(release.handbookEdition)
  const busy = update.isPending

  const apply = (patch: ReleasePatch): void => update.mutate(patch, { onSuccess: () => void checkVersionNow() })

  return (
    <Plate index="Nº 0002" title="Release simulator" actions={<ReleaseAge at={lastCheckedAt} failed={lastCheckError} />}>
      <div className={styles.body}>
        <div className={styles.skew} role="status" aria-live="polite">
          <StatusDot tone={status.tone} label={<strong>Website: {status.label}</strong>} />
          <p className={styles.effect}>{status.effect}</p>
          <p className={styles.effect}>
            Service worker signal, separate from the above: update {swUpdate ? 'waiting' : 'not waiting'}, state {swState}. Deployed build {newDeploy ? 'differs from' : 'matches'} this tab&rsquo;s.
          </p>
        </div>

        <Table caption="Release numbers: relay against this tab" dense minWidth={0} className={stacked.stack}>
          <THead>
            <Tr>
              <Th>Field</Th>
              <Th>This tab runs</Th>
              <Th>Relay now</Th>
              <Th>This tab last heard</Th>
            </Tr>
          </THead>
          <TBody>
            <Row label="Client version" running={`${running.version} (build ${running.buildId})`} now={`latest ${release.latestClient}`} heard={server ? `latest ${server.latestClient}` : null} />
            <Row label="Minimum client" running="" now={release.minClient} heard={server?.minClient ?? null} />
            <Row label="API version" running={String(API_VERSION)} now={String(release.api)} heard={server ? String(server.api) : null} />
            <Row label="Handbook edition" running="" now={release.handbookEdition} heard={null} note="Not announced. You only see it in handbook responses." />
          </TBody>
        </Table>

        <div className={styles.check}>
          <Button size="sm" icon="refresh" onClick={() => void checkVersionNow()}>
            Check now
          </Button>
          <p className={styles.effect}>The tab asks the relay on start, on focus, on reconnect and every 60 s by default. The gap between the two right-hand columns is that wait.</p>
        </div>

        <ul className={styles.scenarios} aria-label="Release scenarios">
          <Scenario icon="upload" label="Publish an update" disabled={busy} what={`latestClient becomes ${publishTo}. Tabs on an older version get the update banner. Nothing is blocked.`} onRun={() => apply(publishPatch(running.version, release.latestClient))} />
          <Scenario icon="lock" label="Force upgrade" variant="danger" disabled={busy} what="minClient rises above this build. A blocking gate covers the app. Asks first." onRun={() => setForcing(true)} />
          <Scenario icon="book" label="Bump handbook edition" disabled={busy} what={`${release.handbookEdition} becomes ${edition}. Handbook responses change, so a chapter cached under the old edition now disagrees with the relay.`} onRun={() => apply({ handbookEdition: edition })} />
          <Scenario
            icon="refresh"
            label="Undo all"
            disabled={busy}
            what={`Back to latest ${DEFAULT_RELEASE.latestClient}, minimum ${DEFAULT_RELEASE.minClient}, API ${DEFAULT_RELEASE.api}, handbook ${DEFAULT_RELEASE.handbookEdition}.`}
            onRun={() => {
              cancelGateLift()
              apply(DEFAULT_RELEASE)
            }}
          />
        </ul>
        <MutationNote status={update.status} error={update.error} success="Release state stored on the relay. Checking what this tab makes of it." />
      </div>
      <ServerReleaseForce open={forcing} onClose={() => setForcing(false)} running={running.version} latest={release.latestClient} onForce={apply} />
    </Plate>
  )
}

function ReleaseAge({ at, failed }: { at: number | null; failed: string | null }) {
  if (at === null) return <span className="muted">Not checked yet</span>
  return (
    <span className="muted">
      Checked <TimeAgo at={at} />
      {failed ? `, last check failed (${failed})` : ''}
    </span>
  )
}

function Row({ label, running, now, heard, note }: { label: string; running: string; now: string; heard: string | null; note?: string }) {
  return (
    <Tr>
      <Td>
        <strong>{label}</strong>
      </Td>
      <Td mono>
        <span className={stacked.label}>This tab runs</span>
        {running || <span className="muted">-</span>}
      </Td>
      <Td mono>
        <span className={stacked.label}>Relay now</span>
        {now}
      </Td>
      <Td mono>
        <span className={stacked.label}>This tab last heard</span>
        {heard ?? <span className="muted">{note ?? 'Not checked yet'}</span>}
      </Td>
    </Tr>
  )
}
