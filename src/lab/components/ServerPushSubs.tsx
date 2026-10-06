import type { PushSubscriptionInfo } from '@shared/contracts'
import { useRemovePushSubscription, type ApiQuery } from '@/lib/queries'
import { SeamStatus } from '@/shell'
import { Button, EmptyState, ErrorState, IconButton, Skeleton, Table, TBody, Td, Th, THead, Tag, TimeAgo, Tr, type Tone } from '@/ui'
import stacked from './ServerStacked.module.css'
import { MutationNote } from './ServerMutationNote'
import styles from './ServerPush.module.css'

const RESULT: Record<PushSubscriptionInfo['lastResult'], Tone> = { never: 'neutral', ok: 'ok', failed: 'error' }

/** Browsers the relay can push to. The list is the relay's record, not the browser's: removing a row does not unsubscribe the browser. */
export function ServerPushSubs({ query }: { query: ApiQuery<{ items: PushSubscriptionInfo[] }> }) {
  const remove = useRemovePushSubscription()
  const items = query.data?.items

  return (
    <div className={styles.key}>
      <h3 className={styles.heading}>Subscriptions</h3>
      {query.isPending ? (
        <div role="status" aria-label="Loading subscriptions">
          <Skeleton lines={2} />
        </div>
      ) : !items ? (
        query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null
      ) : (
        <>
          {query.error ? <ErrorState compact error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
          {items.length === 0 ? (
            <EmptyState compact icon="bell" title="No subscriptions yet" action={<SeamStatus feature="notifications" label="notifications seam" />}>
              Nothing has subscribed to push. Wire <code>subscribePush()</code> in <code>src/pwa/notifications.ts</code>, then use Settings, Notifications to subscribe this browser. A send from here reaches nobody until then, but the payload below is still built.
            </EmptyState>
          ) : (
            <Table caption="Push subscriptions" dense minWidth={0} className={stacked.stack}>
              <THead>
                <Tr>
                  <Th>Push service</Th>
                  <Th>Tail</Th>
                  <Th>Label</Th>
                  <Th>Subscribed</Th>
                  <Th>Last send</Th>
                  <Th>
                    <span className="sr-only">Remove</span>
                  </Th>
                </Tr>
              </THead>
              <TBody>
                {items.map((s) => (
                  <Tr key={s.id}>
                    <Td mono>
                      <span className={stacked.label}>Push service</span>
                      {s.endpointHost}
                    </Td>
                    <Td mono>
                      <span className={stacked.label}>Tail</span>
                      {s.endpointTail}
                    </Td>
                    <Td>
                      <span className={stacked.label}>Label</span>
                      {s.label ?? <span className="muted">none</span>}
                    </Td>
                    <Td nowrap>
                      <span className={stacked.label}>Subscribed</span>
                      <TimeAgo at={s.createdAt} />
                    </Td>
                    <Td>
                      <span className={stacked.label}>Last send</span>
                      <Tag tone={RESULT[s.lastResult]}>{s.lastResult}</Tag>
                    </Td>
                    <Td>
                      <IconButton icon="trash" size="sm" label={`Remove subscription ${s.endpointTail}`} disabled={remove.isPending} onClick={() => remove.mutate({ id: s.id })} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
          <div className={styles.keyRow}>
            <Button size="sm" icon="refresh" loading={query.isFetching} onClick={() => void query.refetch()}>
              Refresh list
            </Button>
            <MutationNote status={remove.status} error={remove.error} success="Removed from the relay's list." />
          </div>
        </>
      )}
    </div>
  )
}
