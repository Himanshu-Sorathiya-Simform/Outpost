import { EmptyState, IconButton, LinkButton, Plate, Tag } from '@/ui'
import { groupCacheNames, useCacheNames } from './BenchCacheReaders'
import styles from './BenchVersionedCaches.module.css'

/** Cache names from caches.keys(), grouped by their `-v<number>` suffix, with the exercise that makes the grouping matter. */
export function BenchVersionedCaches() {
  const { state, refresh } = useCacheNames()
  const families = state.status === 'ready' ? groupCacheNames(state.names) : []

  return (
    <Plate
      index={402}
      title="Versioned caches"
      actions={
        <>
          <IconButton icon="refresh" size="sm" variant="quiet" label="List the caches again" onClick={refresh} />
          <LinkButton to="/lab/caches" size="sm" iconEnd="arrow-right">
            Open Caches
          </LinkButton>
        </>
      }
    >
      <div className={styles.grid}>
        <div className={styles.exercise}>
          <p className={styles.lead}>The exercise: change the truth about your own code.</p>
          <ol className={styles.steps}>
            <li>Name each cache with a version: <code>api-v1</code>, <code>shell-v1</code>.</li>
            <li>Change a cached shape or a strategy, then bump the constant to <code>v2</code> and deploy.</li>
            <li>The new worker installs beside the old one. In <code>activate</code>, list <code>caches.keys()</code> and delete every name not in the current allow-list.</li>
            <li>Come back here. Each family should hold one version. If both stay, nothing is cleaning up and the old shapes are still being served.</li>
          </ol>
        </div>

        <div aria-live="polite" className={styles.live}>
          {state.status === 'loading' ? <p className={styles.quiet}>Listing caches.</p> : null}
          {state.status === 'unsupported' ? (
            <EmptyState compact icon="cache" title="Cache Storage is not available here">
              The page cannot list caches. Cache Storage needs a secure context (https or localhost).
            </EmptyState>
          ) : null}
          {state.status === 'error' ? (
            <EmptyState compact icon="warning" title="The caches could not be listed">
              The browser refused: {state.message}
            </EmptyState>
          ) : null}
          {state.status === 'ready' && families.length === 0 ? (
            <EmptyState compact icon="cache" title="No caches yet">
              A worker creates them. Until one does, there is nothing to version.
            </EmptyState>
          ) : null}
          {families.length > 0 ? (
            <ul className={styles.families} aria-label="Cache families">
              {families.map((family) => {
                const versioned = family.members.filter((m) => m.version !== null)
                const leftover = versioned.length > 1
                return (
                  <li key={family.base} className={styles.family}>
                    <span className={styles.base}>{family.base}</span>
                    <ul className={styles.members}>
                      {family.members.map((m, i) => (
                        <li key={m.name}>
                          <code>{m.name}</code>
                          {m.version === null ? (
                            <Tag tone="neutral">unversioned</Tag>
                          ) : (
                            <Tag tone={i === 0 ? 'ok' : 'warn'}>{i === 0 ? `current v${m.version}` : `old v${m.version}`}</Tag>
                          )}
                        </li>
                      ))}
                    </ul>
                    {leftover ? <p className={styles.warn}>{versioned.length} versions side by side. Activate should have removed the older ones.</p> : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </Plate>
  )
}
