import { useState } from 'react'
import { pwa, usePwaStore } from '@/pwa'
import { checkVersionNow, useVersionStatus } from '@/lib/version'
import { Button, KeyValue, Plate, Tag, TimeAgo, formatStamp } from '@/ui'
import { ActionNote } from '../ActionNote'
import { BackedBy } from '../BackedBy'
import { useSeamAction } from '../use-seam-action'
import styles from './cards.module.css'

const FILE = 'src/pwa/registration.ts'

const SKEW_TEXT = {
  none: { tone: 'ok', text: 'Current' },
  'update-available': { tone: 'warn', text: 'Update available' },
  'update-required': { tone: 'error', text: 'Update required' },
  'api-mismatch': { tone: 'error', text: 'API mismatch' },
} as const

function WebsiteChannel() {
  const v = useVersionStatus()
  const [checking, setChecking] = useState(false)
  const skew = SKEW_TEXT[v.skew]
  const check = (): void => {
    setChecking(true)
    void checkVersionNow().finally(() => setChecking(false))
  }
  return (
    <div className={styles.sub}>
      <h3 className={styles.subTitle}>Website version</h3>
      <p className={styles.hint}>Asks /api/version and /version.json. Needs no service worker.</p>
      <div>
        <Tag tone={skew.tone}>{skew.text}</Tag>
        {v.newDeploy ? (
          <>
            {' '}
            <Tag tone="warn">New deploy is live</Tag>
          </>
        ) : null}
      </div>
      <KeyValue
        dense
        items={[
          { label: 'Running', value: `${v.running.version} / ${v.running.buildId}` },
          { label: 'Built', value: formatStamp(v.running.builtAt) },
          { label: 'Server latest', value: v.server?.latestClient ?? 'unknown' },
          { label: 'Server minimum', value: v.server?.minClient ?? 'unknown' },
          { label: 'Deployed build', value: v.deployed ? `${v.deployed.version} / ${v.deployed.buildId}` : 'unknown' },
          { label: 'Last checked', value: v.lastCheckedAt ? <TimeAgo at={v.lastCheckedAt} /> : 'not yet' },
        ]}
      />
      {v.lastCheckError ? <p className={styles.hint}>The last check hit a {v.lastCheckError} error. The figures above are from the one before.</p> : null}
      <div className={styles.rowCenter}>
        <Button icon="refresh" loading={checking} onClick={check}>
          Check now
        </Button>
        <Button icon="arrow-down" onClick={() => window.location.reload()}>
          Reload now
        </Button>
      </div>
    </div>
  )
}

function WorkerChannel() {
  const registered = usePwaStore((s) => s.swRegistered)
  const swState = usePwaStore((s) => s.swState)
  const waiting = usePwaStore((s) => s.updateAvailable)
  const check = useSeamAction('registration.checkForUpdate', () => pwa.registration.checkForUpdate())
  const apply = useSeamAction('registration.applyUpdate', () => pwa.registration.applyUpdate())
  return (
    <div className={styles.sub}>
      <h3 className={styles.subTitle}>Service worker</h3>
      <p className={styles.hint}>
        Re-fetches <code>sw.js</code> byte by byte. The browser, not the page, decides there is a new worker.
      </p>
      <div>
        <Tag tone={waiting ? 'warn' : registered ? 'ok' : 'neutral'}>{waiting ? 'New worker waiting' : registered ? 'Registered' : 'No worker registered'}</Tag>
      </div>
      <KeyValue
        dense
        items={[
          { label: 'Registered', value: registered ? 'yes' : 'no' },
          { label: 'State', value: swState },
          { label: 'Update waiting', value: waiting ? 'yes' : 'no' },
        ]}
      />
      <div className={styles.rowCenter}>
        <Button icon="refresh" loading={check.state.phase === 'running'} onClick={() => void check.run()}>
          Check for update
        </Button>
        {waiting ? (
          <Button variant="primary" icon="arrow-down" loading={apply.state.phase === 'running'} onClick={() => void apply.run()}>
            Apply update
          </Button>
        ) : null}
      </div>
      <ActionNote subject="Check" state={check.state} file={FILE} okText="The browser re-checked sw.js." />
      <ActionNote subject="Apply" state={apply.state} file={FILE} okText="Told the waiting worker to take over." />
    </div>
  )
}

/** Card 5: two separate update signals, side by side, because a real app has both and they disagree. */
export function UpdatesCard() {
  return (
    <Plate id="updates" index={5} title="App updates">
      <div className={styles.stack}>
        <BackedBy feature="registration" file={FILE}>
          The right-hand channel is its register, checkForUpdate and applyUpdate.
        </BackedBy>
        <div className={styles.two}>
          <WebsiteChannel />
          <WorkerChannel />
        </div>
        <p className={styles.prose}>
          These are different questions. The website check says a newer build exists on the server. The worker check says the browser found a different sw.js. A new deploy can show in one and not the other for a while.
        </p>
      </div>
    </Plate>
  )
}
