import { LinkButton, Plate } from '@/ui'
import styles from './ErrorsRoutes.module.css'

/** The two failures that replace a whole screen. Both are real routes in the router; both are reached by an ordinary link. */
export function ErrorsRoutes() {
  return (
    <Plate index={3} title="Full-page failures">
      <div className={styles.grid}>
        <section className={styles.item} aria-labelledby="route-crash">
          <h3 id="route-crash" className={styles.name}>
            Route crash
          </h3>
          <p className={styles.body}>
            Opens a route whose component throws while rendering. No boundary of its own catches it, so the route's errorElement does: you get the error page inside the shell, a render row in the centre, and the nav still works.
          </p>
          <LinkButton to="/lab/errors/route-crash" icon="bug" variant="ghost" size="sm">
            Open /lab/errors/route-crash
          </LinkButton>
        </section>
        <section className={styles.item} aria-labelledby="route-chunk">
          <h3 id="route-chunk" className={styles.name}>
            Route chunk
          </h3>
          <p className={styles.body}>
            Opens a route whose lazy file does not exist, the way a deleted hashed file looks to an old tab. The router renders the stale-screen page, files a chunk-load row and raises the update banner. Reload tries again and fails again, because the file will never exist; going back is the way out.
          </p>
          <LinkButton to="/lab/errors/route-chunk" icon="download" variant="ghost" size="sm">
            Open /lab/errors/route-chunk
          </LinkButton>
        </section>
      </div>
    </Plate>
  )
}
