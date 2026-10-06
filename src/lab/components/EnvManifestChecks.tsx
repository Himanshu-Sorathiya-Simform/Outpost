import { check } from '../observers/manifest-helpers'
import type { ManifestCheck, ManifestLevel } from '../observers/manifest-load'
import { useWorkerSnapshot } from '../observers/worker-observer'
import { Loader, Table, Tag, TBody, Td, Th, THead, Tr, type IconName, type Tone } from '@/ui'
import stacked from './EnvStacked.module.css'
import styles from './EnvManifestChecks.module.css'

const LEVEL: Record<ManifestLevel, { tone: Tone; icon: IconName; label: string; flag?: 'ok' | 'warn' | 'error' }> = {
  pass: { tone: 'ok', icon: 'check', label: 'Pass', flag: 'ok' },
  warn: { tone: 'warn', icon: 'warning', label: 'Warn', flag: 'warn' },
  fail: { tone: 'error', icon: 'x', label: 'Fail', flag: 'error' },
  info: { tone: 'neutral', icon: 'info', label: 'Note' },
}

const count = (checks: readonly ManifestCheck[], level: ManifestLevel): number => checks.filter((c) => c.level === level).length

/** The two things installability needs that are not in the manifest: a secure context and a service worker controlling this page. */
function environmentChecks(secure: boolean, controller: string | null): ManifestCheck[] {
  return [
    secure
      ? check('Environment', 'secure-context', 'secure context', 'pass', `${location.origin} is a secure context.`)
      : check('Environment', 'secure-context', 'secure context', 'fail', `${location.origin} is neither HTTPS nor localhost. Service workers and installation are unavailable.`),
    controller !== null
      ? check('Environment', 'service-worker', 'service worker', 'pass', `Controlled by ${controller}.`)
      : check('Environment', 'service-worker', 'service worker', 'info', 'No worker controls this page. A manifest that passes every check can still fail to install until one does.'),
  ]
}

/** The checklist: one row per manifest member or asset, plus the environment it depends on, with the reason in words. */
export function EnvManifestChecks({ checks: manifestChecks }: { checks: ManifestCheck[] | null }) {
  const controller = useWorkerSnapshot().controller
  if (manifestChecks === null) {
    return (
      <div role="status">
        <Loader label="Checking members and fetching icons" size="sm" />
      </div>
    )
  }
  const checks = [...manifestChecks, ...environmentChecks(typeof isSecureContext === 'boolean' ? isSecureContext : false, controller ? new URL(controller.scriptURL).pathname : null)]
  return (
    <div className={styles.body}>
      <p className={styles.tally} role="status">
        {(['pass', 'warn', 'fail', 'info'] as const).map((level) => (
          <Tag key={level} tone={LEVEL[level].tone} icon={LEVEL[level].icon}>
            {count(checks, level)} {LEVEL[level].label.toLowerCase()}
          </Tag>
        ))}
      </p>
      <Table caption="Manifest and environment checklist" dense minWidth={0} className={stacked.stack}>
        <THead>
          <Tr>
            <Th>Result</Th>
            <Th>Area</Th>
            <Th>Item</Th>
            <Th>Finding</Th>
          </Tr>
        </THead>
        <TBody>
          {checks.map((c) => {
            const level = LEVEL[c.level]
            return (
              <Tr key={c.id} flag={level.flag}>
                <Td nowrap>
                  <Tag tone={level.tone} icon={level.icon}>
                    {level.label}
                  </Tag>
                </Td>
                <Td className={styles.area}>{c.group}</Td>
                <Td mono className={styles.member}>
                  {c.label}
                </Td>
                <Td className={styles.finding}>{c.message}</Td>
              </Tr>
            )
          })}
        </TBody>
      </Table>
    </div>
  )
}
