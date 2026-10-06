import type { ReactNode } from 'react'
import { useLabSetting, useNetStatus } from '@/lib'
import { useSession } from '@/lib/queries'
import { useWorkerSnapshot } from '../observers/worker-observer'
import { DISPLAY_MODES, displayModeMatches, readStaticFacts, useBrowserOnline, useConnection, useDisplayMode } from '../observers/runtime-facts'
import { ErrorState, KeyValue, Plate, ProvenanceChip, StatusDot, Tag, TimeAgo, type KeyValueItem } from '@/ui'
import styles from './EnvRuntimeFacts.module.css'

const facts = readStaticFacts()

const dash = (value: string | number | null, unit = ''): string => (value === null ? 'not reported' : `${value}${unit}`)

function sessionText(callsign: string | undefined, expiresAt: string | undefined): ReactNode {
  if (!callsign || !expiresAt) return 'signed out'
  return (
    <>
      {callsign}, lapses <TimeAgo at={expiresAt} suffix="" />
    </>
  )
}

/** Things the page can read about where it is running, live where the browser offers an event for it. */
export function EnvRuntimeFacts() {
  const mode = useDisplayMode()
  const online = useBrowserOnline()
  const connection = useConnection()
  const net = useNetStatus()
  const snapshot = useWorkerSnapshot()
  const session = useSession()
  const showProvenance = useLabSetting('showProvenance')

  const controllerText =
    snapshot.phase === 'unsupported'
      ? 'no: no service worker API here'
      : snapshot.controller
        ? `yes, ${new URL(snapshot.controller.scriptURL).pathname} (${snapshot.controller.state})`
        : 'no controller. A first visit, a hard reload, or no worker gives this.'

  const items: KeyValueItem[] = [
    { label: 'Secure context', value: <StatusDot tone={facts.secureContext ? 'ok' : 'error'} label={facts.secureContext ? 'yes' : 'no: service workers, caches and push are hidden'} /> },
    { label: 'Origin', value: facts.origin },
    { label: 'Protocol', value: facts.protocol },
    { label: 'Display mode', value: <Tag tone="accent" solid>{mode}</Tag>, mono: false },
    { label: 'navigator.onLine', value: <StatusDot tone={online ? 'ok' : 'error'} label={online ? 'online' : 'offline'} live={!online} /> },
    {
      label: 'Relay reachable',
      value: <StatusDot tone={net.server === 'reachable' ? 'ok' : net.server === 'unreachable' ? 'error' : 'idle'} label={net.lieFi ? 'no: online but unreachable (lie-fi)' : net.server} />,
    },
    { label: 'Connection type', value: connection ? dash(connection.effectiveType) : 'navigator.connection is missing' },
    { label: 'Downlink / RTT', value: connection ? `${dash(connection.downlinkMbps, ' Mb/s')} / ${dash(connection.rttMs, ' ms')}` : 'not reported' },
    { label: 'Data saver', value: connection ? (connection.saveData === null ? 'not reported' : connection.saveData ? 'on' : 'off') : 'not reported' },
    { label: 'Language', value: facts.languages.length > 1 ? `${facts.language} (${facts.languages.join(', ')})` : facts.language },
    { label: 'Logical cores', value: dash(facts.cores) },
    { label: 'Device memory', value: dash(facts.memoryGb, ' GB') },
    { label: 'Controlled by a worker', value: controllerText },
    { label: 'Cookies', value: facts.cookiesEnabled ? (facts.visibleCookies.length > 0 ? `enabled, visible: ${facts.visibleCookies.join(', ')}` : 'enabled, none visible to script') : 'disabled' },
    { label: 'Session', value: session.data ? sessionText(session.data.session?.operator.callsign, session.data.session?.expiresAt) : session.error ? 'unknown' : 'asking the relay' },
  ]

  return (
    <Plate index="Nº 0002" title="Runtime facts" actions={showProvenance ? <ProvenanceChip meta={session.meta} /> : null}>
      <div className={styles.body}>
        <KeyValue items={items} columns={2} dense />
        <div>
          <p className="label">Display-mode media queries</p>
          <ul className={styles.modes} aria-label="Display-mode media queries">
            {DISPLAY_MODES.map((m) => (
              <li key={m}>
                <Tag tone={displayModeMatches(m) ? 'accent' : 'neutral'} icon={displayModeMatches(m) ? 'check' : 'minus'} title={`(display-mode: ${m}) ${displayModeMatches(m) ? 'matches' : 'does not match'}`}>
                  {m}
                </Tag>
              </li>
            ))}
          </ul>
        </div>
        {session.error ? <ErrorState compact error={session.error} onRetry={() => void session.refetch()} retrying={session.isFetching} /> : null}
        <div>
          <p className="label">User agent</p>
          <p className={`${styles.ua} mono`}>{facts.userAgent}</p>
        </div>
        <p className={styles.hint}>
          The session cookie is HttpOnly, so script cannot list it; the session row comes from the relay. Display mode is a media query, so it updates the moment an installed window changes mode. navigator.onLine only
          reports the network interface: compare it with &quot;Relay reachable&quot; while Chaos is on Hard down.
        </p>
      </div>
    </Plate>
  )
}
