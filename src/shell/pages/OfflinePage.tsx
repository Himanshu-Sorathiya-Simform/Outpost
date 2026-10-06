import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { API } from '@shared/contracts'
import { probeNow, useNetStatus } from '@/lib'
import { handbookIndexQueryOptions } from '@/lib/queries'
import { usePwaStore } from '@/pwa'
import { Button, KeyValue, LinkButton, PageHeader, Plate, StatusDot, TimeAgo, formatClock } from '@/ui'
import { useStoredOfflineMany } from '@/features/handbook/useStoredOffline'
import { useLastContact, useSwControlled } from '../browser-state'
import styles from './pages.module.css'

const WOULD_DO: Array<{ what: string; how: string }> = [
  { what: 'Handbook', how: 'Precached when the worker installs, so every chapter opens with no link at all.' },
  { what: 'Log and stations', how: 'The last copy seen, marked with its age, while the worker revalidates in the background.' },
  { what: 'Filing', how: 'The dispatch goes into a local outbox and is sent when the link returns, once, under its idempotency key.' },
  { what: 'Signal', how: 'Nothing. Live readings are never replayed from a cache, and the page says so.' },
  { what: 'A screen never visited', how: 'This page: the worker answers the navigation with /offline instead of the browser error page.' },
]

/** What a service worker would fall back to when a navigation can be served by neither the network nor a cache. */
export default function OfflinePage() {
  const { browserOnline, server, lieFi, lastLatencyMs, lastProbeAt } = useNetStatus()
  const lastContact = useLastContact((s) => s.at)
  const swState = usePwaStore((s) => s.swState)
  const controlled = useSwControlled()
  const [probing, setProbing] = useState(false)
  const [probedOnce, setProbedOnce] = useState(false)
  // Read-only: what this tab already holds of the handbook, and whether Cache Storage has every chapter. Nothing is fetched here.
  const handbookIndex = useQuery({ ...handbookIndexQueryOptions(), enabled: false })
  const chapterUrls = (handbookIndex.data?.data.chapters ?? []).map((c) => API.handbookChapter(c.slug))
  const chapters = useStoredOfflineMany(chapterUrls)
  const handbookStored = chapterUrls.length > 0 && chapters.settled && chapterUrls.every((u) => chapters.states[u] === 'stored')

  const retry = (): void => {
    setProbing(true)
    void probeNow().finally(() => {
      setProbing(false)
      setProbedOnce(true)
    })
  }

  const relayTone = server === 'reachable' ? 'ok' : lieFi ? 'warn' : server === 'unreachable' ? 'error' : 'idle'
  const relayText = server === 'reachable' ? `Answering${lastLatencyMs === null ? '' : ` in ${lastLatencyMs} ms`}` : lieFi ? 'Not answering (lie-fi)' : server === 'unreachable' ? 'Not answering' : 'Not checked yet'

  return (
    <>
      <PageHeader
        eyebrow="Nº 000 / No signal"
        title="No signal"
        description="This is the page a service worker would show when a screen can be loaded from neither the network nor a cache. Right now Outpost is an ordinary website, so offline you would normally see the browser's own error page instead."
        actions={
          <Button variant="primary" icon="refresh" loading={probing} onClick={retry}>
            Try again
          </Button>
        }
      />

      <div className={styles.split}>
        <Plate index="Fig. 1" title="Link status" actions={<StatusDot tone={relayTone} live={probing} label={browserOnline ? 'Device online' : 'Device offline'} />}>
          <KeyValue
            items={[
              { label: 'Browser', value: browserOnline ? 'Reports a network' : 'Reports no network' },
              { label: 'Relay', value: relayText },
              { label: 'Last contact', value: lastContact === null ? 'None on this page load' : <><time dateTime={new Date(lastContact).toISOString()}>{formatClock(lastContact)}</time>, <TimeAgo at={lastContact} /></> },
              { label: 'Last probe', value: lastProbeAt === null ? 'Not yet' : <TimeAgo at={lastProbeAt} /> },
              { label: 'Service worker', value: `${swState}${controlled ? ', controlling this page' : ', not controlling'}` },
            ]}
          />
          <p className={styles.status} role="status" aria-live="polite">
            {probing ? 'Probing the relay.' : probedOnce ? (server === 'reachable' ? 'The relay answered. You can go back.' : 'Still no answer from the relay.') : ''}
          </p>
        </Plate>

        <Plate index="Fig. 2" title="What works without a link" surface="sunk">
          <div className={styles.links}>
            <LinkButton to="/handbook" icon="book">
              {handbookStored ? 'Handbook' : 'Handbook (not stored yet)'}
            </LinkButton>
            <LinkButton to="/drafts" icon="file">
              Drafts
            </LinkButton>
            <LinkButton to="/log" icon="log">
              Log
            </LinkButton>
          </div>
          <p className={styles.small}>Screens already open, and whatever this tab already holds in memory. Nothing else is promised until a worker is registered.</p>
        </Plate>
      </div>

      <Plate index="Fig. 3" title="What an offline-capable Outpost would do here">
        <dl className={styles.would}>
          {WOULD_DO.map((w) => (
            <div key={w.what} className={styles.wouldRow}>
              <dt>{w.what}</dt>
              <dd>{w.how}</dd>
            </div>
          ))}
        </dl>
      </Plate>
    </>
  )
}
