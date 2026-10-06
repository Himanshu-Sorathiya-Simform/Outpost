import { useState } from 'react'
import { queryClient } from '@/lib'
import { Button, Dialog, Plate } from '@/ui'
import { QueryReactFocus, QueryReactOnline } from './QueryReactManagers'
import styles from './QueryReact.module.css'

/** Poke React Query's own beliefs and the whole cache, without touching the network, the server or a service worker. */
export function QueryReact() {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [said, setSaid] = useState('')

  const invalidateAll = (): void => {
    const count = queryClient.getQueryCache().getAll().length
    void queryClient.invalidateQueries()
    setSaid(`Invalidated ${count} entries. Those on screen refetch now; the rest refetch the next time a screen asks.`)
  }

  const removeAll = (): void => {
    const count = queryClient.getQueryCache().getAll().length
    queryClient.removeQueries()
    setConfirmRemove(false)
    setSaid(`Removed ${count} entries. Screens that were showing them keep their last render until something asks again; navigate or reload to see the cold state.`)
  }

  return (
    <Plate index={5} title="React-level simulators">
      <div className={styles.body}>
        <p className={styles.lede}>
          Everything here changes what React Query thinks or holds. None of it touches the network, the relay or the browser, which is the point: a service worker sits below this layer and will not notice any of it.
        </p>
        <div className={styles.managers}>
          <QueryReactOnline />
          <QueryReactFocus />
        </div>
        <section className={styles.bulk} aria-labelledby="rq-bulk">
          <h3 id="rq-bulk" className={styles.title}>
            The whole cache
          </h3>
          <p className={styles.explain}>
            <em>Invalidate all</em> marks every entry stale and refetches what is on screen: the cheapest way to see a cache-first worker answer a request twice with the same bytes. <em>Remove all queries</em> deletes
            every entry; it is what a cold start looks like, minus the reload.
          </p>
          <div className={styles.actions}>
            <Button size="sm" icon="clock" onClick={invalidateAll}>
              Invalidate all
            </Button>
            <Button size="sm" variant="danger" icon="trash" onClick={() => setConfirmRemove(true)}>
              Remove all queries
            </Button>
          </div>
          <p className={styles.said} aria-live="polite">
            {said}
          </p>
        </section>
      </div>
      <Dialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove every cache entry?"
        footer={
          <>
            <Button data-autofocus onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button variant="danger" icon="trash" onClick={removeAll}>
              Remove all
            </Button>
          </>
        }
      >
        <p className={styles.confirm}>
          The in-memory cache is emptied: dispatches, inbox, stations, session, everything. Nothing is deleted on the relay or from disk. Screens show their last render, then fetch again on the next navigation or focus.
        </p>
      </Dialog>
    </Plate>
  )
}
