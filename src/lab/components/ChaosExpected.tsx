import { Icon, Plate, Table, TBody, Td, Th, THead, Tr } from '@/ui'
import { MODES } from './ChaosModel'
import { observedCount, useProbeStore } from './ChaosProbeStore'
import styles from './ChaosExpected.module.css'

/** Each failure mode, the AppError kind it should produce, and whether a probe has actually produced it in this session. */
export function ChaosExpected() {
  const attempts = useProbeStore((s) => s.attempts)
  const seen = MODES.filter((m) => observedCount(attempts, m.key) > 0).length
  return (
    <Plate index="Nº 0707" title="Expected against observed" actions={<span className={styles.count}>{seen} of {MODES.length} seen</span>}>
      <p className={styles.lede}>
        A tick means a probe hit a path this mode was set to break and the client reported the symptom in the third column. Turn a mode on, fire at a target that shows it, and watch its row. Headers-only targets
        (media, assets) cannot show the modes that depend on a body. Under npm run dev the Vite proxy sits between browser and server: it answers a dropped socket with a 502, which reads as unavailable, and may hold a
        truncated body open until the timeout. npm run pwa talks to the server directly and shows network.
      </p>
      <Table caption="Chaos modes, expected client symptom, observed" dense minWidth={620}>
        <THead>
          <Tr>
            <Th>Mode</Th>
            <Th>The server</Th>
            <Th>The client should report</Th>
            <Th>Observed</Th>
          </Tr>
        </THead>
        <TBody>
          {MODES.map((m) => {
            const n = observedCount(attempts, m.key)
            return (
              <Tr key={m.key} flag={n > 0 ? 'ok' : undefined}>
                <Td mono nowrap>
                  {m.label}
                </Td>
                <Td>{m.server}</Td>
                <Td>{m.expectText}</Td>
                <Td nowrap>
                  {n > 0 ? (
                    <span className={styles.seen}>
                      <Icon name="check" size={14} />
                      Seen {n} {n === 1 ? 'time' : 'times'}
                    </span>
                  ) : (
                    <span className={styles.not}>Not yet</span>
                  )}
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </Table>
    </Plate>
  )
}
