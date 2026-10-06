import { useState } from 'react'
import { Button, Dialog } from '@/ui'

/** Above this many unread, clearing the lot asks first. */
export const CONFIRM_ABOVE = 5

export interface MarkAllReadProps {
  unread: number | undefined
  pending: boolean
  onMarkAll: () => void
}

/** "Mark all read", with a confirmation when it would clear more than five dispatches at once. */
export function MarkAllRead({ unread, pending, onMarkAll }: MarkAllReadProps) {
  const [confirming, setConfirming] = useState(false)
  const count = unread ?? 0

  const run = (): void => {
    setConfirming(false)
    onMarkAll()
  }

  return (
    <>
      <Button
        icon="check"
        loading={pending}
        disabled={count === 0}
        onClick={() => (count > CONFIRM_ABOVE ? setConfirming(true) : run())}
      >
        Mark all read
      </Button>
      <Dialog
        open={confirming}
        size="sm"
        onClose={() => setConfirming(false)}
        title={`Mark ${count} dispatches read?`}
        description="Every unread dispatch on file is closed, including the urgent and critical ones, and the badge count goes to zero. Nothing is deleted, but you will not see them here again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep unread
            </Button>
            <Button variant="primary" icon="check" onClick={run} data-autofocus>
              Mark all read
            </Button>
          </>
        }
      >
        <p>Use this when you have read the list some other way. To go one at a time, cancel and work down the rows.</p>
      </Dialog>
    </>
  )
}
