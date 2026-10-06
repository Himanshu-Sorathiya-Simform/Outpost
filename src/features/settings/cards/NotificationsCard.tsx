import { useCallback, useEffect, useState } from 'react'
import { pwa, usePwaStore, type PermissionState } from '@/pwa'
import { callSeam } from '@/lib/bridge/seam'
import { toAppError } from '@/lib/errors/normalize'
import type { AppError } from '@/lib/errors/app-error'
import { Button, Plate, StatusDot, Tag } from '@/ui'
import { ActionNote } from '../ActionNote'
import { BackedBy } from '../BackedBy'
import { useSeamAction } from '../use-seam-action'
import { StepList, type Step } from './StepList'
import styles from './cards.module.css'

const FILE = 'src/pwa/notifications.ts'

/** The permission as the seam reports it; the store's copy is what the learner's code last wrote. */
function usePermission(): { permission: PermissionState; refresh: () => void } {
  const stored = usePwaStore((s) => s.notificationPermission)
  const [seen, setSeen] = useState<PermissionState | null>(null)
  const refresh = useCallback(() => {
    void callSeam('notifications.permission', () => pwa.notifications.permission(), { quiet: true }).then((value) => {
      if (value !== undefined) setSeen(value)
    })
  }, [])
  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])
  return { permission: seen ?? stored, refresh }
}

const PERMISSION_TONE = { granted: 'ok', denied: 'error', default: 'neutral', unsupported: 'neutral' } as const
const PERMISSION_TEXT: Record<PermissionState, string> = {
  granted: 'Granted',
  denied: 'Blocked',
  default: 'Not asked',
  unsupported: 'Unsupported',
}

const stepFor = (error: AppError): Step['status'] => (error.kind === 'not-implemented' ? 'unwired' : error.kind === 'permission' ? 'denied' : 'failed')

/** Card 3: permission, push subscription and a local test. Nothing here asks the browser for anything until a button is pressed. */
export function NotificationsCard() {
  const { permission, refresh } = usePermission()
  const subscribed = usePwaStore((s) => s.pushSubscribed)
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [enabling, setEnabling] = useState(false)
  const test = useSeamAction('notifications.showLocal', () =>
    pwa.notifications.showLocal('Outpost local test', { body: 'Shown by this page through the service worker registration. No server was involved.' }),
  )
  const disable = useSeamAction('notifications.unsubscribePush', () => pwa.notifications.unsubscribePush())

  const enable = async (): Promise<void> => {
    setEnabling(true)
    const asked: Step = { label: 'Ask for permission', status: 'pending' }
    const subscribe: Step = { label: 'Subscribe to push and register with the server', status: 'pending' }
    setSteps([asked, subscribe])
    try {
      if (permission === 'granted') {
        asked.status = 'ok'
        asked.detail = 'Already granted, not asked again.'
      } else {
        asked.status = 'running'
        setSteps([{ ...asked }, { ...subscribe }])
        const answer = await callSeam('notifications.requestPermission', () => pwa.notifications.requestPermission())
        refresh()
        asked.status = answer === 'granted' ? 'ok' : 'denied'
        asked.detail = answer === 'granted' ? 'Granted.' : answer === 'denied' ? 'Blocked. The browser will not ask again.' : 'Dismissed without an answer.'
        if (answer !== 'granted') {
          subscribe.status = 'skipped'
          setSteps([{ ...asked }, { ...subscribe }])
          return
        }
      }
      subscribe.status = 'running'
      setSteps([{ ...asked }, { ...subscribe }])
      await callSeam('notifications.subscribePush', () => pwa.notifications.subscribePush())
      subscribe.status = 'ok'
      subscribe.detail = 'Subscribed.'
    } catch (thrown) {
      const error = toAppError(thrown)
      const failing = asked.status === 'running' ? asked : subscribe
      failing.status = stepFor(error)
      failing.detail = failing.status === 'unwired' ? 'Not wired up yet.' : error.userMessage
      if (failing === asked) subscribe.status = 'skipped'
    } finally {
      setSteps([{ ...asked }, { ...subscribe }])
      setEnabling(false)
    }
  }

  const blocked = permission === 'denied'
  const unsupported = permission === 'unsupported'

  return (
    <Plate
      id="notifications"
      index={3}
      title="Notifications"
      actions={
        <>
          <Tag tone={PERMISSION_TONE[permission]}>{PERMISSION_TEXT[permission]}</Tag>
          <StatusDot tone={subscribed ? 'ok' : 'idle'} label={subscribed ? 'Push subscribed' : 'No push subscription'} />
        </>
      }
    >
      <div className={styles.stack}>
        <BackedBy feature="notifications" file={FILE}>
          Permission, the push subscription and the local test all live there.
        </BackedBy>
        {blocked ? (
          <p className={styles.prose} role="status">
            Blocked in the browser settings for this site. A page cannot ask again once that has happened; change it from the address bar's site controls, then come back and press Enable.
          </p>
        ) : null}
        {unsupported ? <p className={styles.prose}>This browser has no Notification API, so there is nothing to enable. Everything else on this site works without it.</p> : null}
        <div className={styles.rowCenter}>
          <Button variant="primary" icon="bell" loading={enabling} disabled={blocked || unsupported} onClick={() => void enable()}>
            Enable alerts
          </Button>
          <Button icon="bolt" loading={test.state.phase === 'running'} disabled={blocked || unsupported} onClick={() => void test.run()}>
            Send local test
          </Button>
          <Button variant="quiet" icon="x" loading={disable.state.phase === 'running'} onClick={() => void disable.run()}>
            Disable
          </Button>
        </div>
        {steps ? <StepList steps={steps} /> : null}
        <ActionNote subject="Local test" state={test.state} file={FILE} okText="Local notification handed to the browser." deniedText="The browser refused to show it. Check that permission is granted." />
        <ActionNote subject="Disable" state={disable.state} file={FILE} okText="Push subscription removed." />
        <p className={styles.hint}>
          Enable asks for permission only when pressed, never on load. The server can then push through Lab, Server, Push console.
        </p>
      </div>
    </Plate>
  )
}
