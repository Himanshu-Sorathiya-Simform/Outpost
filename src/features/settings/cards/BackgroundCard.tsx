import { useEffect, useState } from 'react'
import { PERIODIC_TAG_DIGEST } from '@shared/sw-protocol'
import { callSeam } from '@/lib/bridge/seam'
import { pwa, usePwaStore } from '@/pwa'
import { Button, Field, KeyValue, Plate, Select, Switch, Tag } from '@/ui'
import { ActionNote } from '../ActionNote'
import { BackedBy } from '../BackedBy'
import { useSeamAction } from '../use-seam-action'
import styles from './cards.module.css'

const FILE = 'src/pwa/periodic-sync.ts'
const MINUTE = 60_000
const INTERVALS = [
  { value: String(15 * MINUTE), label: 'Every 15 minutes' },
  { value: String(60 * MINUTE), label: 'Every hour' },
  { value: String(12 * 60 * MINUTE), label: 'Every 12 hours' },
]

/** Card 6: ask the browser to wake the worker now and then to fetch the digest. The browser picks the real schedule. */
export function BackgroundCard() {
  const tags = usePwaStore((s) => s.periodicTags)
  const standalone = usePwaStore((s) => s.standalone)
  const [supported, setSupported] = useState<boolean | null>(null)
  const [interval, setIntervalMs] = useState(INTERVALS[1]?.value ?? String(60 * MINUTE))
  const register = useSeamAction('periodicSync.register', (ms: number) => pwa.periodicSync.register(PERIODIC_TAG_DIGEST, ms))
  const unregister = useSeamAction('periodicSync.unregister', () => pwa.periodicSync.unregister(PERIODIC_TAG_DIGEST))
  const list = useSeamAction('periodicSync.list', () => pwa.periodicSync.list())

  useEffect(() => {
    void callSeam('periodicSync.isSupported', () => pwa.periodicSync.isSupported(), { quiet: true }).then((value) => setSupported(value ?? null))
  }, [])

  const on = tags.includes(PERIODIC_TAG_DIGEST)
  const busy = register.state.phase === 'running' || unregister.state.phase === 'running'
  const listed = list.state.value

  return (
    <Plate
      id="background"
      index={6}
      title="Background refresh"
      actions={<Tag tone={supported === null ? 'neutral' : supported ? 'ok' : 'warn'}>{supported === null ? 'Support unknown' : supported ? 'API present' : 'API missing'}</Tag>}
    >
      <div className={styles.stack}>
        <BackedBy feature="periodicSync" file={FILE}>
          {`Register and unregister the ${PERIODIC_TAG_DIGEST} tag; the worker's periodicsync handler fetches the digest.`}
        </BackedBy>
        <div className={styles.row}>
          <Switch
            checked={on}
            disabled={busy}
            label="Refresh the digest in the background"
            description={on ? `Registered as ${PERIODIC_TAG_DIGEST}.` : 'Not registered.'}
            onChange={(next) => void (next ? register.run(Number(interval)) : unregister.run())}
          />
          <Field label="Asked interval" labelHidden>
            <Select value={interval} options={INTERVALS} onChange={(e) => setIntervalMs(e.target.value)} />
          </Field>
        </div>
        <ActionNote subject="Register" state={register.state} file={FILE} okText="Registered." deniedText="The browser will not allow periodic sync for this site. It usually needs an installed app." unsupportedText="This browser has no Periodic Background Sync." />
        <ActionNote subject="Unregister" state={unregister.state} file={FILE} okText="Unregistered." />
        <KeyValue
          dense
          items={[
            { label: 'API in this browser', value: supported === null ? 'unknown' : supported ? 'present' : 'missing' },
            { label: 'Running as installed app', value: standalone ? 'yes' : 'no' },
            { label: 'Tags the page knows of', value: tags.length > 0 ? tags.join(', ') : 'none' },
          ]}
        />
        <div className={styles.rowCenter}>
          <Button size="sm" icon="refresh" loading={list.state.phase === 'running'} onClick={() => void list.run()}>
            Ask the browser for its tags
          </Button>
          {listed ? <span className={styles.hint}>{listed.length > 0 ? listed.join(', ') : 'The browser lists no tags.'}</span> : null}
        </div>
        <ActionNote subject="Tag list" state={list.state} file={FILE} />
        <p className={styles.prose}>
          The interval is a request, not a schedule. Chromium decides the real timing from how much you use the site, and only runs it for an installed app. Expect hours, not minutes, and nothing at all in other browsers.
        </p>
      </div>
    </Plate>
  )
}
