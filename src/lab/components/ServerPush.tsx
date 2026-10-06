import { useEffect } from 'react'
import { useLabFeedStore } from '@/lib'
import { usePushSubscriptions, usePushVapid, useSendPush } from '@/lib/queries'
import { CopyButton, ErrorState, Plate, ProvenanceChip, Skeleton, Tag } from '@/ui'
import { ServerPushForm } from './ServerPushForm'
import { ServerPushSubs } from './ServerPushSubs'
import styles from './ServerPush.module.css'

function PublicKey() {
  const query = usePushVapid()
  const key = query.data?.publicKey
  return (
    <div className={styles.key}>
      <h3 className={styles.heading}>VAPID public key</h3>
      {key ? (
        <div className={styles.keyRow}>
          <code className={styles.keyText}>{key}</code>
          <CopyButton value={key} label="Copy key" />
        </div>
      ) : query.error ? (
        <ErrorState compact error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <Skeleton width="60%" />
      )}
      <p className={styles.note}>
        The worker passes this as <code>applicationServerKey</code> to <code>pushManager.subscribe</code>. It is generated once and kept on disk, so a subscription survives a restart of the relay.
      </p>
    </div>
  )
}

/** Everything about Web Push from the relay's side: the key, who is subscribed, and a form that sends a real push. */
export function ServerPush({ showProvenance }: { showProvenance: boolean }) {
  const subs = usePushSubscriptions()
  const send = useSendPush()
  const items = subs.data?.items ?? []
  const liveCount = useLabFeedStore((s) => s.labState?.counters.subscriptions)
  const { refetch } = subs

  // The live feed knows the count before the list does (a worker subscribed, or a send pruned a dead one).
  useEffect(() => {
    if (liveCount !== undefined) void refetch()
  }, [liveCount, refetch])

  return (
    <Plate
      index="Nº 0005"
      title="Push console"
      actions={
        <>
          <Tag tone={items.length > 0 ? 'ok' : 'neutral'} aria-live="polite">
            {items.length} {items.length === 1 ? 'subscription' : 'subscriptions'}
          </Tag>
          {showProvenance ? <ProvenanceChip meta={subs.meta} /> : null}
        </>
      }
    >
      <div className={styles.body}>
        <PublicKey />
        <ServerPushSubs query={subs} />
        <ServerPushForm subscriptions={items} send={send} />
      </div>
    </Plate>
  )
}
