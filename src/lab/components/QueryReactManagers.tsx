import { focusManager, onlineManager } from '@tanstack/react-query'
import { Button, StatusDot, Tag } from '@/ui'
import { useBrowserOnline, usePageVisible, useReactFocused, useReactOnline } from './QueryReactState'
import styles from './QueryReactManagers.module.css'

interface Belief {
  label: string
  on: boolean
  onText: string
  offText: string
}

function Beliefs({ react, browser }: { react: Belief; browser: Belief }) {
  const differ = react.on !== browser.on
  return (
    <div className={styles.beliefs}>
      {[react, browser].map((b) => (
        <p key={b.label} className={styles.belief}>
          <span className={styles.who}>{b.label}</span>
          <StatusDot tone={b.on ? 'ok' : 'warn'} label={b.on ? b.onText : b.offText} />
        </p>
      ))}
      {differ ? (
        <Tag tone="warn" icon="warning">
          they disagree
        </Tag>
      ) : null}
    </div>
  )
}

/** React Query's onlineManager: the belief that pauses queries. It is a flag in memory, set by events or by hand, and it can be wrong in both directions. */
export function QueryReactOnline() {
  const react = useReactOnline()
  const browser = useBrowserOnline()
  return (
    <section className={styles.panel} aria-labelledby="rq-online">
      <h3 id="rq-online" className={styles.title}>
        onlineManager
      </h3>
      <Beliefs react={{ label: 'React believes', on: react, onText: 'online', offText: 'offline' }} browser={{ label: 'Browser says', on: browser, onText: 'online', offText: 'offline' }} />
      <p className={styles.explain}>
        This is React&apos;s belief, not the network&apos;s. Set it offline and every query with network mode <em>online</em> pauses before it sends anything, while the real connection is fine; with <em>offlineFirst</em> the first attempt
        still goes out. Mutations pause the same way. The flag stays where you leave it, across pages, until a real online or offline event or the button below changes it.
      </p>
      <div className={styles.actions}>
        <Button size="sm" variant="danger" icon="offline" onClick={() => onlineManager.setOnline(false)}>
          Tell React: offline
        </Button>
        <Button size="sm" icon="online" onClick={() => onlineManager.setOnline(true)}>
          Tell React: online
        </Button>
        <Button size="sm" variant="quiet" icon="arrow-left" onClick={() => onlineManager.setOnline(navigator.onLine)}>
          Follow the browser
        </Button>
      </div>
    </section>
  )
}

/** focusManager: the belief that triggers refetch on window focus. Pulsing it is how you test that without leaving the tab. */
export function QueryReactFocus() {
  const react = useReactFocused()
  const visible = usePageVisible()
  return (
    <section className={styles.panel} aria-labelledby="rq-focus">
      <h3 id="rq-focus" className={styles.title}>
        focusManager
      </h3>
      <Beliefs react={{ label: 'React believes', on: react, onText: 'focused', offText: 'unfocused' }} browser={{ label: 'Page is', on: visible, onText: 'visible', offText: 'hidden' }} />
      <p className={styles.explain}>
        Going from unfocused to focused refetches every stale query that a screen is showing, if the focus refetch setting is on. <em>Pulse focus</em> does exactly that without switching tabs. By default React follows page
        visibility, so an installed app that stays visible on a second monitor never counts as having lost focus.
      </p>
      <div className={styles.actions}>
        <Button
          size="sm"
          icon="bolt"
          onClick={() => {
            focusManager.setFocused(false)
            focusManager.setFocused(true)
          }}
        >
          Pulse focus
        </Button>
        <Button size="sm" icon="eye-off" onClick={() => focusManager.setFocused(false)}>
          Tell React: unfocused
        </Button>
        <Button size="sm" icon="eye" onClick={() => focusManager.setFocused(true)}>
          Tell React: focused
        </Button>
        <Button size="sm" variant="quiet" icon="arrow-left" onClick={() => focusManager.setFocused(undefined)}>
          Follow the page
        </Button>
      </div>
    </section>
  )
}
