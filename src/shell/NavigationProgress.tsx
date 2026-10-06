import { useNavigation } from 'react-router'
import styles from './NavigationProgress.module.css'

/** A thin stepped bar under the telemetry strip while a navigation is pending (lazy route chunk loading). */
export function NavigationProgress() {
  const navigation = useNavigation()
  if (navigation.state === 'idle') return null
  return (
    <div className={styles.track} aria-hidden="true">
      <span className={styles.bar} />
    </div>
  )
}
