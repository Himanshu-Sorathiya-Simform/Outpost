import { useState, type FormEvent } from 'react'
import { SessionCreate, type LabState } from '@shared/contracts'
import { useClockIn, useClockOut, useSession, useSessionControl, useSessionTimeLeft } from '@/lib/queries'
import { Button, ErrorState, Field, Input, KeyValue, LinkButton, Plate, ProvenanceChip, Segmented, Skeleton, StatusDot, formatStamp } from '@/ui'
import { MutationNote } from './ServerMutationNote'
import styles from './ServerSession.module.css'

const TTLS = [
  { sec: 30, label: '30 s' },
  { sec: 120, label: '2 min' },
  { sec: 600, label: '10 min' },
]

/** The server's view of the operator's shift, and the switches that lapse it on purpose. */
export function ServerSession({ ttlSec, showProvenance }: { ttlSec: LabState['sessionTtlSec']; showProvenance: boolean }) {
  const query = useSession()
  const left = useSessionTimeLeft()
  const control = useSessionControl()
  const clockIn = useClockIn()
  const clockOut = useClockOut()
  const [callsign, setCallsign] = useState('LAB-01')
  const [problem, setProblem] = useState<string | null>(null)
  const { session } = left

  const ttlOptions = TTLS.some((t) => t.sec === ttlSec) ? TTLS : [...TTLS, { sec: ttlSec, label: `${ttlSec} s` }]

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const parsed = SessionCreate.safeParse({ callsign })
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Callsign not accepted')
      return
    }
    setProblem(null)
    clockIn.mutate({ callsign: parsed.data.callsign })
  }

  return (
    <Plate index="Nº 0004" title="Session control" actions={showProvenance ? <ProvenanceChip meta={query.meta} /> : null} aria-busy={query.isPending}>
      <div className={styles.body}>
        {query.isPending ? (
          <div role="status" aria-label="Reading the session">
            <Skeleton lines={3} />
          </div>
        ) : query.error && !query.data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        ) : (
          <div className={styles.state}>
            {query.error ? <ErrorState compact error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
            {session ? (
              <>
                <StatusDot tone={left.expired ? 'warn' : 'ok'} label={<strong>{left.expired ? `${session.operator.callsign}: lapsed on this clock` : `${session.operator.callsign} is clocked in`}</strong>} />
                <KeyValue
                  dense
                  columns={2}
                  items={[
                    { label: 'Operator', value: session.operator.displayName },
                    { label: 'Time left', value: left.label, mono: true },
                    { label: 'Issued', value: formatStamp(session.issuedAt) },
                    { label: 'Expires', value: formatStamp(session.expiresAt) },
                  ]}
                />
              </>
            ) : (
              <StatusDot tone="idle" label={<strong>Nobody is clocked in</strong>} />
            )}
            <p className={styles.note}>
              This is the answer of <code>GET /api/session</code>. After Expire now the relay has already forgotten the operator, but this tab keeps saying otherwise until something asks again. Filing or acknowledging in that gap is a 401.
            </p>
          </div>
        )}

        <div className={styles.cols}>
          <div className={styles.group}>
            <h3 className={styles.heading}>Lapse it</h3>
            <div className={styles.row}>
              <Button icon="hourglass" variant="danger" loading={control.isPending} onClick={() => control.mutate({ action: 'expire' }, { onSuccess: () => clockIn.reset() })}>
                Expire now
              </Button>
              <Button icon="refresh" onClick={() => void query.refetch()} loading={query.isFetching}>
                Ask the relay again
              </Button>
              <LinkButton to="/file" icon="pen">
                Try filing
              </LinkButton>
            </div>
            <Segmented
              label="Lifetime of the next sessions"
              showLabel
              size="sm"
              value={String(ttlSec)}
              onChange={(v) => control.mutate({ action: 'set-ttl', ttlSec: Number(v) })}
              options={ttlOptions.map((t) => ({ value: String(t.sec), label: t.label }))}
            />
            <p className={styles.note}>The lifetime applies to sessions created after the change. The cookie you hold keeps its own Max-Age, so clock out and in again to try a short shift.</p>
            <MutationNote status={control.status} error={control.error} success={control.variables?.action === 'expire' ? 'Expired. The relay has dropped every session it held.' : 'Stored. Sessions created from now on last this long.'} />
          </div>

          <form className={styles.group} onSubmit={submit} noValidate>
            <h3 className={styles.heading}>Clock in and out</h3>
            <Field label="Callsign" hint="2 to 16 letters, digits or dashes." error={problem}>
              <Input value={callsign} onChange={(e) => setCallsign(e.target.value)} autoComplete="off" spellCheck={false} maxLength={16} />
            </Field>
            <div className={styles.row}>
              <Button type="submit" variant="primary" icon="key" loading={clockIn.isPending}>
                Clock in
              </Button>
              <Button icon="lock" loading={clockOut.isPending} disabled={!session} onClick={() => clockOut.mutate()}>
                Clock out
              </Button>
            </div>
            <MutationNote status={clockIn.status} error={clockIn.error} success="Clocked in." />
            <MutationNote status={clockOut.status} error={clockOut.error} success="Clocked out." />
          </form>
        </div>
      </div>
    </Plate>
  )
}
