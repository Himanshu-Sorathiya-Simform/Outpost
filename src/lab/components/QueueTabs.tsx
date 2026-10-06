import { useState } from 'react'
import { useOpenTabs, useLabSetting, type OpenTab } from '@/lib'
import { Button, Disclosure, EmptyState, Plate, StatusDot, Table, TBody, Td, Th, THead, Tag, TimeAgo, Tr } from '@/ui'
import { sendSettingsChanged, sendTestInvalidate } from './QueueTabsBroadcast'
import stacked from './ServerStacked.module.css'
import styles from './QueueTabs.module.css'

const controllerName = (url: string | null): string => {
  if (url === null) return 'none'
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}`
  } catch {
    return url
  }
}

interface Flags {
  skew: boolean
  controller: boolean
}

const flagsFor = (tab: OpenTab, self: OpenTab | undefined): Flags => ({
  skew: self !== undefined && !tab.self && tab.buildId !== self.buildId,
  controller: self !== undefined && !tab.self && tab.controller !== self.controller,
})

interface Sent {
  tone: 'ok' | 'warn'
  text: string
}

/** Every tab of this origin that has announced itself in the last 12 s, and whether any of them run different code from this one. */
export function QueueTabs() {
  const tabs = useOpenTabs()
  const tabSync = useLabSetting('tabSync')
  const [sent, setSent] = useState<Sent | null>(null)
  const self = tabs.find((t) => t.self)
  const others = tabs.filter((t) => !t.self)
  const flags = tabs.map((t) => flagsFor(t, self))
  const skewed = flags.filter((f) => f.skew).length
  const differing = flags.filter((f) => f.controller).length

  const note = (tone: Sent['tone'], text: string): void => setSent({ tone, text })

  return (
    <Plate index="Nº 0004" title="Open tabs" actions={<Tag tone={others.length > 0 ? 'info' : 'neutral'}>{tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'}</Tag>}>
      <div className={styles.body}>
        <div className={styles.verdict} role="status" aria-live="polite">
          {skewed > 0 ? <StatusDot tone="warn" label={<strong>{skewed} other {skewed === 1 ? 'tab runs' : 'tabs run'} a different build</strong>} /> : <StatusDot tone="ok" label={<strong>{others.length === 0 ? 'No other tab open' : 'Every tab runs this build'}</strong>} />}
          <p>
            {differing > 0 ? `${differing} ${differing === 1 ? 'tab has' : 'tabs have'} a different service worker controller. ` : ''}
            Each tab announces itself every 5 s over a BroadcastChannel and drops off the list after 12 s of silence.
          </p>
        </div>

        {tabs.length === 0 ? (
          <EmptyState compact icon="window" title="This tab has not announced itself yet">
            Presence starts with the app and the first announcement takes a moment.
          </EmptyState>
        ) : (
          <Table caption="Tabs of this origin" dense minWidth={0} className={stacked.stack}>
            <THead>
              <Tr>
                <Th>Tab</Th>
                <Th>Version</Th>
                <Th>Build</Th>
                <Th>Controller script</Th>
                <Th>Visibility</Th>
                <Th>Last heard</Th>
              </Tr>
            </THead>
            <TBody>
              {tabs.map((tab, i) => {
                const f = flags[i] ?? { skew: false, controller: false }
                return (
                  <Tr key={tab.tabId} flag={f.skew ? 'warn' : undefined} selected={tab.self}>
                    <Td mono>
                      <span className={stacked.label}>Tab</span>
                      {tab.tabId}
                      <span className={styles.flags}>
                        {tab.self ? <Tag tone="accent">This tab</Tag> : null}
                        {f.skew ? <Tag tone="warn" icon="warning">Skew</Tag> : null}
                        {f.controller ? <Tag tone="info">Other controller</Tag> : null}
                      </span>
                    </Td>
                    <Td mono>
                      <span className={stacked.label}>Version</span>
                      {tab.version}
                    </Td>
                    <Td mono>
                      <span className={stacked.label}>Build</span>
                      {tab.buildId}
                    </Td>
                    <Td mono className={styles.url}>
                      <span className={stacked.label}>Controller script</span>
                      {tab.controller === null ? <span className="muted">none</span> : controllerName(tab.controller)}
                    </Td>
                    <Td>
                      <span className={stacked.label}>Visibility</span>
                      {tab.visibility}
                    </Td>
                    <Td nowrap>
                      <span className={stacked.label}>Last heard</span>
                      {tab.self ? <span className="muted">this tab</span> : <TimeAgo at={tab.seenAt} />}
                    </Td>
                  </Tr>
                )
              })}
            </TBody>
          </Table>
        )}

        <div className={styles.actions}>
          <Button
            icon="send"
            disabled={others.length === 0}
            onClick={() => {
              sendTestInvalidate()
              if (tabSync) note('ok', `Invalidate sent to ${others.length} other ${others.length === 1 ? 'tab' : 'tabs'}. A tab refetches the dispatches only if it is showing them (open the Log there); its Network lab shows the requests.`)
              else note('warn', 'Nothing sent: the lab setting tabSync is off.')
            }}
          >
            Broadcast a test invalidate
          </Button>
          <Button
            icon="send"
            disabled={others.length === 0}
            onClick={() =>
              sendSettingsChanged('app')
                ? note('ok', 'settings-changed sent. Other tabs re-read their appearance settings from storage.')
                : note('warn', 'Not sent: this browser has no BroadcastChannel.')
            }
          >
            Send settings-changed
          </Button>
        </div>
        <div role="status" aria-live="polite">
          {sent ? (
            <p className={styles.sent}>
              <StatusDot tone={sent.tone} label={sent.text} />
            </p>
          ) : null}
        </div>
        {others.length === 0 ? (
          <p className={styles.note}>
            Both buttons need a second tab to be of any use. Open <code>/log</code> in another tab and <code>/lab/queue</code> here, send a test invalidate, and watch that tab refetch without being touched.
          </p>
        ) : null}

        <Disclosure summary="Test an old tab against a new worker">
          <ol className={styles.steps}>
            <li>Open the app in two tabs. Both list the same build here.</li>
            <li>Run <code>npm run release</code> to bump the version and rebuild, then reload only one tab.</li>
            <li>That tab now shows a different build and the other one carries a Skew stamp. Check the Controller column: the old tab still talks to the old worker until it is closed.</li>
            <li>Make your worker call skipWaiting and claim, reload the new tab, and watch the old tab&rsquo;s controller change underneath it. Does the old page still understand the messages the new worker sends?</li>
            <li>Use the protocol tester below to send the old page a message it does not know, and see what the bridge does with it.</li>
          </ol>
        </Disclosure>
      </div>
    </Plate>
  )
}
