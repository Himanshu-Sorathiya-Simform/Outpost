import { useState, type FormEvent } from 'react'
import { SessionCreate } from '@shared/contracts'
import { sessionPrompt, useClockIn, useSessionPrompt } from '@/lib/queries'
import { Button, Dialog, ErrorState, Field, Input } from '@/ui'
import styles from './ClockInDialog.module.css'

const FORM_ID = 'clock-in-form'
const LAPSED_BODY = 'Clock in again under your callsign to keep filing and acknowledging. Nothing on this screen is lost.'

function ClockInPrompt({ reason }: { reason: string | null }) {
  const clockIn = useClockIn()
  const [callsign, setCallsign] = useState('')
  const [invalid, setInvalid] = useState<string | null>(null)

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    const parsed = SessionCreate.safeParse({ callsign: callsign.trim() })
    if (!parsed.success) {
      setInvalid(parsed.error.issues[0]?.message ?? 'Enter a callsign.')
      return
    }
    setInvalid(null)
    clockIn.mutate(parsed.data)
  }

  return (
    <Dialog
      open
      size="sm"
      onClose={sessionPrompt.close}
      title={reason === null ? 'Your shift has lapsed' : 'Clock in'}
      description={reason ?? LAPSED_BODY}
      footer={
        <>
          <Button variant="ghost" onClick={sessionPrompt.close}>
            Not now
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} icon="key" loading={clockIn.isPending}>
            Clock in
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className={styles.form} onSubmit={submit} noValidate>
        <Field label="Callsign" hint="2 to 16 letters, digits or dashes. Shown on everything you file." error={invalid ?? undefined} required>
          <Input
            data-autofocus
            value={callsign}
            onChange={(e) => {
              setCallsign(e.target.value)
              setInvalid(null)
            }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={16}
            placeholder="HALDEN"
          />
        </Field>
        {clockIn.error ? <ErrorState compact error={clockIn.error} /> : null}
      </form>
    </Dialog>
  )
}

/** Renders the session prompt the data layer opens on a 401 (and the strip's "Off shift" button opens by hand). */
export function ClockInDialog() {
  const { open, reason } = useSessionPrompt()
  return open ? <ClockInPrompt reason={reason} /> : null
}
