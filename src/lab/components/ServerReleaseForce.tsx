import { useState } from 'react'
import type { ReleasePatch } from '@shared/contracts'
import { Button, Dialog, Field, Select } from '@/ui'
import { scheduleGateLift } from './ServerReleaseLift'
import { forcePatch } from './ServerReleaseScenarios'
import styles from './ServerRelease.module.css'

const LIFT_AFTER = [
  { value: '15000', label: '15 seconds' },
  { value: '30000', label: '30 seconds' },
  { value: '120000', label: '2 minutes' },
]

interface Props {
  open: boolean
  onClose: () => void
  running: string
  latest: string
  onForce: (patch: ReleasePatch) => void
}

/** Confirmation before a forced upgrade: the gate cannot be dismissed, so the dialog says how it ends. */
export function ServerReleaseForce({ open, onClose, running, latest, onForce }: Props) {
  const [liftMs, setLiftMs] = useState('30000')
  const patch = forcePatch(running, latest)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Force this tab to upgrade?"
      description={`minClient becomes ${patch.minClient}, this tab runs ${running}.`}
      footer={
        <>
          <Button data-autofocus onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            icon="lock"
            onClick={() => {
              onForce(patch)
              scheduleGateLift(Number(liftMs))
              onClose()
            }}
          >
            Force upgrade
          </Button>
        </>
      }
    >
      <div className={styles.force}>
        <p>
          The next version check raises the <strong>Update required</strong> gate over the whole app, in every open tab. It has one button, Reload, and Escape does nothing. Reloading does not help: the same build comes back and the gate
          returns.
        </p>
        <p>
          Undo all restores the release, but nothing on this page can be clicked while the gate is up. So this page lowers minClient again by itself. If you reload, it does so the next time <code>/lab/server</code> loads.
        </p>
        <Field label="Lift the gate after">
          <Select value={liftMs} onChange={(e) => setLiftMs(e.target.value)} options={LIFT_AFTER} />
        </Field>
      </div>
    </Dialog>
  )
}
