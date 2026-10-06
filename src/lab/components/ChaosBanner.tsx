import type { ChaosState } from '@shared/contracts'
import { useApplyChaosPreset } from '@/lib/queries'
import { Button, ErrorState, Icon } from '@/ui'
import { activeRules } from './ChaosModel'
import styles from './ChaosBanner.module.css'

/**
 * Stays on screen while anything is broken on purpose. Chaos lives on the server, so it does not end when you leave
 * this page or close the tab: the banner says so, and All clear is always one click away.
 */
export function ChaosBanner({ chaos }: { chaos: ChaosState }) {
  const clear = useApplyChaosPreset()
  const rules = activeRules(chaos)
  const active = chaos.serverOffline || chaos.schemaDrift || rules > 0
  return (
    <div className={styles.wrap} data-active={active || undefined} role="status" aria-live="polite">
      {active ? (
        <div className={styles.banner}>
          <Icon name="warning" size={18} />
          <p className={styles.text}>
            <strong>Chaos active:</strong> {rules} {rules === 1 ? 'rule' : 'rules'}, server offline: {chaos.serverOffline ? 'yes' : 'no'}, schema drift: {chaos.schemaDrift ? 'on' : 'off'}.
            <span className={styles.aside}> It stays on until you clear it, even if you close this tab.</span>
          </p>
          <Button variant="primary" size="sm" icon="check" loading={clear.isPending} onClick={() => clear.mutate('all-clear')}>
            All clear
          </Button>
        </div>
      ) : (
        <p className={styles.quiet}>All clear. No rule is enabled and both switches are off.</p>
      )}
      {clear.error ? <ErrorState compact error={clear.error} onRetry={() => clear.mutate('all-clear')} retrying={clear.isPending} /> : null}
    </div>
  )
}
