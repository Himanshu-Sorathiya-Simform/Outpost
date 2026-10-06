import { Tag } from '@/ui'
import type { MismatchClass } from './ConsistencyModel'
import styles from './ConsistencyExplain.module.css'

const CLASSES: ReadonlyArray<{ id: MismatchClass; title: string; body: string }> = [
  {
    id: 'sw-cache',
    title: 'The service worker cache outlives React state',
    body: 'React asked, the worker answered from Cache Storage, and React stored that body as fresh. Now React and the cache agree with each other and not with the server. The fix is in the worker: revalidate in the background and tell the page (cache-updated), or keep the route out of the cache.',
  },
  {
    id: 'persisted',
    title: 'React persisted cache',
    body: 'With persistence on, the query cache is restored from IndexedDB on reload, up to 24 hours old. The buster setting decides whether an older build\'s data survives. Until something refetches, the screen shows the restored copy.',
  },
  {
    id: 'optimistic',
    title: 'Optimistic update not rolled back',
    body: 'A patch flips read, acked or starred in React at once and leaves the revision alone. If the request never finished, or the refetch that follows it was skipped, the flags stay changed here while the server kept its own: same revision, different flags.',
  },
  {
    id: 'two-tabs',
    title: 'Two tabs',
    body: 'Another tab changed the record. The server moved; this tab\'s React did not, because the broadcast that invalidates it was missed or tab sync is switched off in the lab settings.',
  },
]

/** The four ways a copy ends up wrong in a PWA. The ones that fit the row you opened it from are marked. */
export function ConsistencyExplain({ suspects }: { suspects: readonly MismatchClass[] }) {
  return (
    <div className={styles.box}>
      <p className={styles.lead}>{suspects.length > 0 ? 'This row differs. The marked causes fit what is different.' : 'Nothing differs on this row. These are the ways it could.'}</p>
      <dl className={styles.list}>
        {CLASSES.map((c) => (
          <div key={c.id} className={suspects.includes(c.id) ? styles.fits : styles.item}>
            <dt className={styles.title}>
              {c.title}
              {suspects.includes(c.id) ? (
                <Tag tone="accent" icon="arrow-right">
                  Fits this row
                </Tag>
              ) : null}
            </dt>
            <dd className={styles.body}>{c.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
