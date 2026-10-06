import { useState, type ReactNode } from 'react'
import { pwa } from '@/pwa'
import { SeamStatus } from '@/shell'
import { Button, Dialog, Plate, StatusDot, TimeAgo, type IconName, type StatusTone } from '@/ui'
import { useWorkerSnapshot } from '../observers/worker-observer'
import { useWorkerActions, type ActionId, type Outcome } from './WorkerActionState'
import styles from './WorkerActions.module.css'

const TONE: Record<Outcome['tone'], StatusTone> = { ok: 'ok', warn: 'warn', error: 'error', neutral: 'idle' }

function Result({ outcome }: { outcome: Outcome | undefined }) {
  if (!outcome) return <p className={`${styles.outcome} ${styles.idle}`}>Not run yet.</p>
  return (
    <p className={styles.outcome} role="status">
      <StatusDot tone={TONE[outcome.tone]} label={outcome.text} />
      <span className="muted">
        <TimeAgo at={outcome.at} />
      </span>
    </p>
  )
}

interface Confirm {
  title: string
  body: string
  label: string
  run(): void
}

function Row({ id, label, icon, onClick, busy, outcome, seam, disabled }: { id: ActionId; label: string; icon: IconName; onClick: () => void; busy: ActionId | null; outcome: Outcome | undefined; seam?: string; disabled?: boolean }) {
  return (
    <li className={styles.item} data-action={id}>
      <div className={styles.control}>
        <Button size="sm" icon={icon} loading={busy === id} disabled={disabled} onClick={onClick}>
          {label}
        </Button>
        {seam ? <SeamStatus feature={seam} label="seam" /> : null}
      </div>
      <Result outcome={outcome} />
    </li>
  )
}

/** Generic controls that work on whatever worker you build: three seam calls and four messages to the controller. */
export function WorkerActions() {
  const { outcomes, busy, runSeam, send } = useWorkerActions()
  const snap = useWorkerSnapshot()
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const controller: ReactNode = snap.controller ? `${new URL(snap.controller.scriptURL).pathname} (${snap.controller.state})` : 'none'

  return (
    <Plate index="Nº 0004" title="Actions">
      <div className={styles.body}>
        <section className={styles.group} aria-labelledby="seam-actions">
          <h3 id="seam-actions" className={styles.title}>
            Through the seams
          </h3>
          <p className={styles.note}>These call the methods in src/pwa/registration.ts. While they are stubs each one reports that, and nothing else happens.</p>
          <ul className={styles.list}>
            <Row id="check-update" label="Check for update" icon="refresh" seam="registration.checkForUpdate" busy={busy} outcome={outcomes['check-update']} onClick={() => void runSeam('check-update', 'registration.checkForUpdate', () => pwa.registration.checkForUpdate(), () => 'Asked the browser to re-fetch the worker script. A changed script raises updatefound in the timeline.')} />
            <Row id="apply-update" label="Apply update" icon="download" seam="registration.applyUpdate" busy={busy} outcome={outcomes['apply-update']} onClick={() => void runSeam('apply-update', 'registration.applyUpdate', () => pwa.registration.applyUpdate(), () => 'Told the waiting worker to take over. The page normally reloads on controllerchange.')} />
            <Row
              id="unregister"
              label="Unregister"
              icon="trash"
              seam="registration.unregister"
              busy={busy}
              outcome={outcomes.unregister}
              onClick={() =>
                setConfirm({
                  title: 'Unregister the service worker?',
                  body: 'The registration is removed. This page keeps its current controller until it reloads, and the caches stay where they are: unregistering does not delete them.',
                  label: 'Unregister',
                  run: () => void runSeam('unregister', 'registration.unregister', () => pwa.registration.unregister(), (done) => (done ? 'Unregistered. The timeline shows the registration going away.' : 'unregister() resolved false: there was no registration to remove.')),
                })
              }
            />
          </ul>
        </section>
        <section className={styles.group} aria-labelledby="message-actions">
          <h3 id="message-actions" className={styles.title}>
            Messages to the controller
          </h3>
          <p className={styles.note}>
            Controller now: <strong>{controller}</strong>. A message goes to the worker that controls this page, not to whichever one is newest. Replies show in the message log below.
          </p>
          <ul className={styles.list}>
            <Row id="get-version" label="Send get-version" icon="send" busy={busy} outcome={outcomes['get-version']} onClick={() => send('get-version', { type: 'get-version' })} />
            <Row id="ping" label="Send ping" icon="signal" busy={busy} outcome={outcomes.ping} onClick={() => send('ping', { type: 'ping', nonce: crypto.randomUUID().slice(0, 8) })} />
            <Row id="skip-waiting" label="Send skip-waiting" icon="play" busy={busy} outcome={outcomes['skip-waiting']} onClick={() => send('skip-waiting', { type: 'skip-waiting' })} />
            <Row
              id="clear-caches"
              label="Send clear-caches"
              icon="trash"
              busy={busy}
              outcome={outcomes['clear-caches']}
              onClick={() => setConfirm({ title: 'Ask the worker to clear its caches?', body: 'Your worker decides what that means. A worker that honours it will delete every cache it owns, and the next offline visit will have nothing to show.', label: 'Send clear-caches', run: () => send('clear-caches', { type: 'clear-caches' }) })}
            />
          </ul>
        </section>
      </div>
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant="danger"
              data-autofocus
              onClick={() => {
                confirm?.run()
                setConfirm(null)
              }}
            >
              {confirm?.label}
            </Button>
          </>
        }
      >
        <p>{confirm?.body}</p>
      </Dialog>
    </Plate>
  )
}
