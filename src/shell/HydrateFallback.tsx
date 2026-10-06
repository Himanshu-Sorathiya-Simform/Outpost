import { Loader, Logo } from '@/ui'
import styles from './RootFallback.module.css'

/** Shown by the router while the first lazy route is still loading, before the shell has anything to draw. */
export function HydrateFallback() {
  return (
    <div className={styles.loading} aria-busy="true">
      <Logo caption="Field dispatch log" size={30} />
      <Loader />
    </div>
  )
}
