import { useMutation } from '@tanstack/react-query'
import type { OutboxItem } from '@shared/sw-protocol'
import { useOutbox } from '@/features/compose/outbox/useOutbox'
import { callSeam, type AppError } from '@/lib'
import { pwa } from '@/pwa'
import { SeamStatus } from '@/shell'
import { Button, EmptyState, ErrorState, IconButton, LinkButton, Loader, Plate, Table, TBody, Td, Th, THead, Tag, TimeAgo, Tr, type Tone } from '@/ui'
import { MutationNote } from './ServerMutationNote'
import stacked from './ServerStacked.module.css'
import styles from './QueueOutbox.module.css'

const STATUS: Record<OutboxItem['status'], Tone> = { queued: 'info', sending: 'warn', failed: 'error' }

/** The outbox as the seam reports it: what the worker has been asked to send, one row per queued dispatch. */
export function QueueOutbox() {
  const { state, refreshing, refresh } = useOutbox()
  const remove = useMutation<void, AppError, string>({
    mutationKey: ['queue-lab', 'remove'],
    mutationFn: (id) => callSeam('sync.removeQueued', () => pwa.sync.removeQueued(id)),
    onSettled: () => refresh(),
  })
  const flush = useMutation<void, AppError, void>({
    mutationKey: ['queue-lab', 'flush'],
    mutationFn: () => callSeam('sync.flushNow', () => pwa.sync.flushNow()),
    onSettled: () => refresh(),
  })

  const items = state.status === 'ready' || state.status === 'error' ? state.items : null

  return (
    <Plate
      index="Nº 0003"
      title="Outbox"
      aria-busy={state.status === 'loading' || refreshing}
      actions={
        <>
          <SeamStatus feature="sync" label="sync seam" />
          <IconButton icon="refresh" label="List the outbox again" size="sm" onClick={() => void refresh()} disabled={refreshing} />
        </>
      }
    >
      <div className={styles.body}>
        {state.status === 'loading' ? <Loader label="Listing the outbox" size="sm" /> : null}

        {state.status === 'not-wired' ? (
          <EmptyState compact icon="queue" title="Not wired up yet" action={<SeamStatus feature="sync.listQueued" label="listQueued" />}>
            <code>sync.listQueued()</code> in <code>src/pwa/sync.ts</code> still throws. A dispatch that fails to send stays as a draft on this device; nothing is queued for a worker. Fill in the IndexedDB outbox and the rows
            appear here.
          </EmptyState>
        ) : null}

        {state.status === 'error' ? <ErrorState compact={items !== null} error={state.error} onRetry={() => void refresh()} retrying={refreshing} /> : null}

        {items && items.length === 0 ? (
          <EmptyState compact icon="queue" title="The outbox is empty">
            Nothing is waiting to be sent. Switch on <em>Hard down</em> in the chaos console and file a dispatch to put something here.
          </EmptyState>
        ) : null}

        {items && items.length > 0 ? (
          <Table caption="Queued dispatches" dense minWidth={0} className={stacked.stack}>
            <THead>
              <Tr>
                <Th>Dispatch</Th>
                <Th>Queued</Th>
                <Th numeric>Attempts</Th>
                <Th>Status</Th>
                <Th>Last error</Th>
                <Th>
                  <span className="sr-only">Remove</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {items.map((item) => (
                <Tr key={item.id} flag={item.status === 'failed' ? 'error' : undefined}>
                  <Td className={styles.wrap}>
                    <span className={stacked.label}>Dispatch</span>
                    <strong>{item.payload.title}</strong>
                    <br />
                    <code>{item.id}</code>
                  </Td>
                  <Td nowrap>
                    <span className={stacked.label}>Queued</span>
                    <TimeAgo at={item.createdAt} />
                  </Td>
                  <Td mono numeric>
                    <span className={stacked.label}>Attempts</span>
                    {item.attempts}
                  </Td>
                  <Td>
                    <span className={stacked.label}>Status</span>
                    <Tag tone={STATUS[item.status]}>{item.status}</Tag>
                  </Td>
                  <Td mono className={styles.wrap}>
                    <span className={stacked.label}>Last error</span>
                    {item.lastError ?? <span className="muted">none</span>}
                  </Td>
                  <Td>
                    <IconButton icon="trash" size="sm" label={`Remove ${item.payload.title} from the outbox`} disabled={remove.isPending} onClick={() => remove.mutate(item.id)} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : null}

        <div className={styles.row}>
          <Button icon="sync" loading={flush.isPending} disabled={state.status === 'not-wired' || !items || items.length === 0} onClick={() => flush.mutate()}>
            Retry all now
          </Button>
          <LinkButton to="/drafts" icon="pen" variant="ghost">
            Open drafts
          </LinkButton>
          <SeamStatus feature="sync.flushNow" label="flushNow" />
        </div>
        {flush.status !== 'idle' ? <MutationNote status={flush.status} error={flush.error} success="Replay requested. The list shows what is left." pending="Replaying the outbox" /> : null}
        {remove.status !== 'idle' ? <MutationNote status={remove.status} error={remove.error} success="Removed from the outbox." pending="Removing" /> : null}
        <p className={styles.note}>
          An item sent twice is not filed twice: the relay answers a repeated Idempotency-Key with the first dispatch and an <code>Idempotent-Replay</code> header.
        </p>
      </div>
    </Plate>
  )
}
