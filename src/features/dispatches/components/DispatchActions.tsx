import { useState } from 'react'
import type { Dispatch, DispatchPatch } from '@shared/contracts'
import { Button, CopyButton } from '@/ui'
import type { DispatchPatcher } from '../hooks/useDispatchPatcher'
import type { DispatchSharing } from '../hooks/useShareDispatch'
import { dispatchIndex } from '../format'
import styles from './DispatchActions.module.css'

export interface DispatchActionsProps {
  dispatch: Dispatch
  patcher: DispatchPatcher
  sharing: DispatchSharing
}

/**
 * Star, read, acknowledge, share. The writes are optimistic: the label flips at once and the button shows a busy
 * state until the relay has answered. A refused write puts the old label back and a toast says so. Acknowledging
 * needs a shift; signed out, the clock-in dialog opens from the data layer.
 */
export function DispatchActions({ dispatch: d, patcher, sharing }: DispatchActionsProps) {
  const [sharePending, setSharePending] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const no = dispatchIndex(d.id)

  const run = (patch: DispatchPatch, said: string): void => {
    setAnnouncement(said)
    void patcher.change(d.id, patch)
  }
  const share = async (): Promise<void> => {
    setSharePending(true)
    try {
      await sharing.share()
    } finally {
      setSharePending(false)
    }
  }

  return (
    <div className={styles.group} role="group" aria-label="Dispatch actions">
      <Button
        variant={d.acked ? 'ghost' : 'primary'}
        icon="check"
        loading={patcher.isPending(d.id, 'acked')}
        onClick={() => run({ acked: !d.acked }, d.acked ? `${no} acknowledgment withdrawn` : `${no} acknowledged`)}
      >
        {d.acked ? 'Withdraw acknowledgment' : 'Acknowledge'}
      </Button>
      <Button icon="star" loading={patcher.isPending(d.id, 'starred')} onClick={() => run({ starred: !d.starred }, d.starred ? `${no} star removed` : `${no} starred`)}>
        {d.starred ? 'Remove star' : 'Star'}
      </Button>
      <Button icon={d.read ? 'eye-off' : 'eye'} loading={patcher.isPending(d.id, 'read')} onClick={() => run({ read: !d.read }, d.read ? `${no} marked unread` : `${no} marked read`)}>
        {d.read ? 'Mark as unread' : 'Mark as read'}
      </Button>
      <Button icon={sharing.canShare ? 'share' : 'link'} loading={sharePending} onClick={() => void share()}>
        {sharing.canShare ? 'Share' : 'Copy link'}
      </Button>
      {sharing.canShare ? <CopyButton value={sharing.url} label="Copy link" size="md" /> : null}
      <p className="sr-only" role="status">
        {announcement}
      </p>
    </div>
  )
}
