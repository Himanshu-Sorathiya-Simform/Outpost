import type { LabState } from '@shared/contracts'
import { useSetHeaderProfile } from '@/lib/queries'
import { Plate, Segmented, Table, TBody, Td, Th, THead, Tr, cx } from '@/ui'
import stacked from './ServerStacked.module.css'
import { CACHE_ROWS, PROFILES } from './ServerHeaderProfiles'
import { MutationNote } from './ServerMutationNote'
import styles from './ServerHeaders.module.css'

/** Which Cache-Control the relay sends. Only responses from now on are affected: copies already cached keep the headers they came with. */
export function ServerHeaders({ profile }: { profile: LabState['headerProfile'] }) {
  const set = useSetHeaderProfile()
  const shown = set.isPending && set.variables ? set.variables : profile
  const info = PROFILES.find((p) => p.value === shown) ?? PROFILES[0]

  return (
    <Plate index="Nº 0003" title="Header profile">
      <div className={styles.body}>
        <div className={styles.pick}>
          <Segmented
            label="Caching headers the relay sends"
            showLabel
            value={shown}
            onChange={(value) => set.mutate(value)}
            options={PROFILES.map((p) => ({ value: p.value, label: p.label, disabled: set.isPending && p.value !== shown }))}
          />
          <MutationNote status={set.status} error={set.error} success="Profile switched. New responses carry the new headers." />
        </div>

        {info ? (
          <div className={styles.explain}>
            <section>
              <h3 className={styles.heading}>What changes</h3>
              <p>{info.changes}</p>
            </section>
            <section>
              <h3 className={styles.heading}>What it teaches</h3>
              <p>{info.teaches}</p>
            </section>
            <section>
              <h3 className={styles.heading}>Try</h3>
              <ol>
                {info.tryThis.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            </section>
          </div>
        ) : null}

        <Table caption="Cache-Control by resource and profile" dense minWidth={0} className={stacked.stack}>
          <THead>
            <Tr>
              <Th>Resource</Th>
              {PROFILES.map((p) => (
                <Th key={p.value} className={cx(p.value === shown && styles.active)} aria-current={p.value === shown ? 'true' : undefined}>
                  {p.label}
                  {p.value === shown ? ' (active)' : ''}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {CACHE_ROWS.map((row) => (
              <Tr key={row.resource}>
                <Td>{row.resource}</Td>
                {PROFILES.map((p) => (
                  <Td key={p.value} mono className={cx(p.value === shown && styles.active)}>
                    <span className={stacked.label}>{p.label}</span>
                    {row.values[p.value]}
                  </Td>
                ))}
              </Tr>
            ))}
          </TBody>
        </Table>
        <p className={styles.note}>Switching the profile does not clear anything. Copies the browser or a worker already holds keep the headers they arrived with, which is the point of the trap.</p>
      </div>
    </Plate>
  )
}
