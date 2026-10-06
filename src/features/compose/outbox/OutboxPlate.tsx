import { useState } from 'react'
import type { OutboxItem } from '@shared/sw-protocol'
import { callSeam } from '@/lib/bridge'
import { toAppError } from '@/lib/errors/normalize'
import { notify } from '@/lib/notify'
import { pwa } from '@/pwa'
import { SeamStatus } from '@/shell'
import { Button, EmptyState, ErrorState, IconButton, Loader, Plate, Skeleton, TimeAgo } from '@/ui'
import { Notice } from '../components/Notice'
import { draftActions, useDrafts } from '../drafts/draft-store'
import { OutboxRow } from './OutboxRow'
import type { Outbox } from './useOutbox'
import styles from './OutboxPlate.module.css'

const SYNC_FILE = 'src/pwa/sync.ts'

/** The seam-managed queue: what the service worker has been asked to send. A stub shows as "not wired", never as an error. */
export function OutboxPlate({ outbox: { state, refreshing, refresh } }: { outbox: Outbox }) {
  const drafts = useDrafts()
  const [busy, setBusy] = useState<'flush' | string | null>(null)
  const [flushNote, setFlushNote] = useState<string | null>(null)

  const remove = async (item: OutboxItem): Promise<void> => {
    setBusy(item.id)
    try {
      await callSeam('sync.removeQueued', () => pwa.sync.removeQueued(item.id))
      // The copy on this device stays, marked so it can be sent again by hand.
      const draft = drafts.find((d) => d.clientId === item.id)
      if (draft) draftActions.mark(draft.id, { origin: 'offline-failed', lastError: 'Taken out of the outbox before it was sent.' })
      notify({ tone: 'info', title: 'Removed from the outbox', message: draft ? 'The draft is still on this device.' : undefined })
      await refresh()
    } catch (thrown) {
      const error = toAppError(thrown, { source: 'seam:sync.removeQueued' })
      notify({
        tone: error.kind === 'not-implemented' ? 'info' : 'error',
        title: error.kind === 'not-implemented' ? 'Not wired up yet' : 'Could not remove it',
        message: error.userMessage,
      })
    } finally {
      setBusy(null)
    }
  }

  const flush = async (): Promise<void> => {
    setBusy('flush')
    setFlushNote(null)
    try {
      await callSeam('sync.flushNow', () => pwa.sync.flushNow())
      setFlushNote('Replay requested. The list below shows what is left.')
      await refresh()
    } catch (thrown) {
      const error = toAppError(thrown, { source: 'seam:sync.flushNow' })
      setFlushNote(error.kind === 'not-implemented' ? `Retry all is not wired up yet. It is sync.flushNow in ${SYNC_FILE}.` : error.userMessage)
    } finally {
      setBusy(null)
    }
  }

  const items = state.status === 'ready' || state.status === 'error' ? state.items : null
  const checkedAt = state.status === 'ready' || state.status === 'error' ? state.checkedAt : null

  const actions = (
    <>
      <SeamStatus feature="sync" label="Seam" />
      <IconButton icon="refresh" label="Check the outbox again" size="sm" onClick={() => void refresh()} disabled={refreshing} />
      <Button
        size="sm"
        icon="sync"
        loading={busy === 'flush'}
        disabled={state.status === 'not-wired' || !items || items.length === 0}
        onClick={() => void flush()}
      >
        Retry all now
      </Button>
    </>
  )

  return (
    <Plate index="Fig. 2" title="Outbox" actions={actions} aria-busy={state.status === 'loading' || refreshing}>
      <div className={styles.body}>
        {state.status === 'loading' ? (
          <div className={styles.loading}>
            <Loader label="Checking the outbox" size="sm" />
            <Skeleton lines={2} />
          </div>
        ) : null}

        {state.status === 'not-wired' ? (
          <Notice tone="quiet" title="Not wired up yet">
            <p>Nothing is managing an outbox. A dispatch that cannot be sent stays in the list on this device until you send it yourself.</p>
            <p>
              To change that, implement <code>queueDispatch</code> and <code>listQueued</code> in <code>{SYNC_FILE}</code>.
            </p>
          </Notice>
        ) : null}

        {state.status === 'error' ? <ErrorState error={state.error} onRetry={() => void refresh()} retrying={refreshing} /> : null}

        {items && state.status !== 'not-wired' ? (
          <>
            {items.length === 0 ? (
              <EmptyState compact icon="queue" title="The outbox is empty">
                Nothing is waiting for a signal. A dispatch lands here when a send fails on a dead link and the outbox takes it.
              </EmptyState>
            ) : (
              <ul className={styles.list} aria-label="Queued dispatches">
                {items.map((item) => (
                  <OutboxRow key={item.id} item={item} removing={busy === item.id} onRemove={() => void remove(item)} />
                ))}
              </ul>
            )}
            <p className={styles.fresh} aria-live="polite">
              {state.status === 'error' ? 'Showing the last list read' : 'Checked'} {checkedAt ? <TimeAgo at={checkedAt} /> : 'never'}.
            </p>
          </>
        ) : null}

        {flushNote ? (
          <p className={styles.note} role="status">
            {flushNote}
          </p>
        ) : null}
      </div>
    </Plate>
  )
}
