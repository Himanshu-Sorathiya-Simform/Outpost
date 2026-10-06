import { useState, type FormEvent } from 'react'
import { SessionCreate, type Session } from '@shared/contracts'
import { useClockIn, useClockOut, useSession, useSessionTimeLeft } from '@/lib/queries'
import { Button, ErrorState, Field, Input, KeyValue, Meter, Plate, Skeleton, Stat, formatClock, formatStamp } from '@/ui'
import styles from './cards.module.css'

const LOW_WATER = 0.2

function SignedIn({ session, label, msLeft, expired, onClockOut, clockingOut }: { session: Session; label: string | null; msLeft: number | null; expired: boolean; onClockOut: () => void; clockingOut: boolean }) {
  const issued = Date.parse(session.issuedAt)
  const span = Date.parse(session.expiresAt) - issued
  const ratio = msLeft !== null && span > 0 ? msLeft / span : 0
  return (
    <div className={styles.stack}>
      <div className={styles.two}>
        <div className={styles.stack}>
          <Stat size="lg" label="Time left on shift" value={expired ? '0:00' : (label ?? '--')} tone={expired ? 'error' : ratio < LOW_WATER ? 'warn' : 'default'} />
          <Meter
            label="Shift"
            value={msLeft ?? 0}
            max={span > 0 ? span : 1}
            segments={24}
            tone={ratio < LOW_WATER ? 'warn' : 'ok'}
            valueText={expired ? 'expired' : `${label ?? '--'} left`}
            hideHeader
          />
          <p className={styles.hint} aria-live="off">
            {expired ? 'The clock ran out; asking the server whether it agrees.' : 'Counted on this device clock. The server decides what is still valid.'}
          </p>
        </div>
        <KeyValue
          dense
          items={[
            { label: 'Callsign', value: session.operator.callsign },
            { label: 'Name on file', value: session.operator.displayName },
            { label: 'Clocked in', value: formatStamp(session.issuedAt) },
            { label: 'Expires', value: formatClock(session.expiresAt) },
          ]}
        />
      </div>
      <div className={styles.rowCenter}>
        <Button icon="lock" loading={clockingOut} onClick={onClockOut}>
          Clock out
        </Button>
        <p className={styles.hint}>A shift does not extend while you work. When it runs out, filing and acknowledging stop until you clock in again.</p>
      </div>
    </div>
  )
}

/** Card 1: who is on shift, for how long, and the form to start one. */
export function OperatorCard() {
  const session = useSession()
  const left = useSessionTimeLeft()
  const clockIn = useClockIn()
  const clockOut = useClockOut()
  const [callsign, setCallsign] = useState('')
  const [invalid, setInvalid] = useState<string | null>(null)
  // The last session seen while this card was mounted. If it disappears without a clock-out, the shift lapsed.
  const [lastSeen, setLastSeen] = useState<Session | null>(null)
  if (left.session && left.session !== lastSeen) setLastSeen(left.session)

  const current = session.data?.session ?? null
  const lapsed = current === null && lastSeen !== null

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    const parsed = SessionCreate.safeParse({ callsign: callsign.trim() })
    if (!parsed.success) {
      setInvalid(parsed.error.issues[0]?.message ?? 'Enter a callsign.')
      return
    }
    setInvalid(null)
    clockIn.mutate(parsed.data, { onSuccess: () => setCallsign('') })
  }

  let body
  if (session.isPending) {
    body = <Skeleton variant="block" height="7rem" />
  } else if (session.data === undefined && session.error) {
    body = <ErrorState error={session.error} onRetry={() => void session.refetch()} retrying={session.isFetching} />
  } else if (current) {
    body = (
      <SignedIn
        session={current}
        label={left.label}
        msLeft={left.msLeft}
        expired={left.expired}
        clockingOut={clockOut.isPending}
        onClockOut={() => clockOut.mutate(undefined, { onSuccess: () => setLastSeen(null) })}
      />
    )
  } else {
    body = (
      <form className={styles.stack} onSubmit={submit} noValidate>
        {lapsed ? (
          <p className={styles.prose} role="status">
            Your shift ran out at {formatClock(lastSeen.expiresAt)}. The server stopped honouring the cookie at that moment, with no warning in between. Anything you could read
            still reads; filing and acknowledging need a new shift.
          </p>
        ) : (
          <p className={styles.prose}>Off shift. Reading needs no callsign. Filing a dispatch and acknowledging one do, and the shift is short by design.</p>
        )}
        <div className={styles.row}>
          <Field className={styles.grow} label="Callsign" hint="2 to 16 letters, digits or dashes. Printed on everything you file." error={invalid ?? undefined} required>
            <Input
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
          <Button type="submit" variant="primary" icon="key" loading={clockIn.isPending}>
            Clock in
          </Button>
        </div>
        {clockIn.error ? <ErrorState compact error={clockIn.error} /> : null}
      </form>
    )
  }

  return (
    <Plate id="operator" index={1} title="Operator">
      {body}
      {session.data !== undefined && session.error ? <ErrorState compact error={session.error} onRetry={() => void session.refetch()} retrying={session.isFetching} /> : null}
      {clockOut.error ? <ErrorState compact error={clockOut.error} /> : null}
    </Plate>
  )
}
