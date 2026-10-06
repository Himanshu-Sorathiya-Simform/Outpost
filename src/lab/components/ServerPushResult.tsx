import type { PushSendResult, PushSubscriptionInfo } from '@shared/contracts'
import { JsonView, Stat, StatGroup, Table, TBody, Td, Th, THead, Tag, Tr } from '@/ui'
import stacked from './ServerStacked.module.css'
import styles from './ServerPushForm.module.css'

/** What the relay reported for the last send: totals, one line per subscription, and the payload it really built. */
export function ServerPushResult({ result, subscriptions }: { result: PushSendResult | undefined; subscriptions: PushSubscriptionInfo[] }) {
  if (!result) return null
  const name = (id: string): string => {
    const s = subscriptions.find((x) => x.id === id)
    return s ? `${s.endpointHost} ...${s.endpointTail}` : id
  }
  return (
    <div className={styles.result} aria-live="polite">
      <h3 className={styles.heading}>Result of the last send</h3>
      <StatGroup>
        <Stat label="Attempted" value={result.attempted} />
        <Stat label="Delivered" value={result.delivered} tone={result.delivered > 0 ? 'ok' : 'default'} />
        <Stat label="Failed" value={result.failed} tone={result.failed > 0 ? 'error' : 'default'} />
        <Stat label="Pruned" value={result.pruned} tone={result.pruned > 0 ? 'warn' : 'default'} note="404 or 410: the subscription is gone" />
      </StatGroup>
      {result.scheduledInSec > 0 ? <p className={styles.note}>Scheduled: the relay sends this in {result.scheduledInSec} s. The counts above are zero until then; the live feed reports the outcome.</p> : null}
      {result.attempted === 0 && result.scheduledInSec === 0 ? <p className={styles.note}>No subscription to send to. The push was built and dropped.</p> : null}
      {result.results.length > 0 ? (
        <Table caption="Result per subscription" dense minWidth={0} className={stacked.stack}>
          <THead>
            <Tr>
              <Th>Subscription</Th>
              <Th>Outcome</Th>
              <Th>Status</Th>
              <Th>Error</Th>
            </Tr>
          </THead>
          <TBody>
            {result.results.map((r) => (
              <Tr key={r.id} flag={r.ok ? undefined : 'error'}>
                <Td mono>
                  <span className={stacked.label}>Subscription</span>
                  {name(r.id)}
                </Td>
                <Td>
                  <span className={stacked.label}>Outcome</span>
                  <Tag tone={r.ok ? 'ok' : 'error'} icon={r.ok ? 'check' : 'x'}>
                    {r.ok ? 'delivered' : 'failed'}
                  </Tag>
                </Td>
                <Td mono>
                  <span className={stacked.label}>Status</span>
                  {r.statusCode ?? '-'}
                </Td>
                <Td mono className={styles.err}>
                  <span className={stacked.label}>Error</span>
                  {r.error ?? <span className="muted">none</span>}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : null}
      <JsonView value={result.payload} title="Payload as sent" expandDepth={1} maxHeight={260} />
    </div>
  )
}
