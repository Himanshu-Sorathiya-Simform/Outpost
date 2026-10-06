import { useEffect, useState } from 'react'
import { CAPABILITIES, detectAll, readPermission, type CapabilityStatus, type PermissionReading } from '../observers/capabilities'
import { Button, Plate, Segmented, StatusDot, Table, Tag, TBody, Td, Th, THead, Tr, type StatusTone } from '@/ui'
import stacked from './EnvStacked.module.css'
import styles from './EnvCapabilityMatrix.module.css'

type Filter = 'all' | CapabilityStatus

const STAMP: Record<CapabilityStatus, { tone: StatusTone; label: string }> = {
  supported: { tone: 'ok', label: 'Supported' },
  partial: { tone: 'warn', label: 'Partial' },
  unsupported: { tone: 'idle', label: 'Unsupported' },
}

function Permission({ reading }: { reading: PermissionReading | undefined }) {
  if (!reading) return <span className="muted">reading</span>
  if (reading.state === 'unknown') {
    return (
      <Tag tone="neutral" title={reading.reason}>
        Not exposed
      </Tag>
    )
  }
  return <Tag tone={reading.state === 'granted' ? 'ok' : reading.state === 'denied' ? 'error' : 'info'}>{reading.state}</Tag>
}

/** Every PWA-relevant API, probed live in this browser, with what Outpost does when it is absent. */
export function EnvCapabilityMatrix() {
  const [rows, setRows] = useState(detectAll)
  const [filter, setFilter] = useState<Filter>('all')
  const [permissions, setPermissions] = useState<Record<string, PermissionReading>>({})

  useEffect(() => {
    let current = true
    const wanted = CAPABILITIES.flatMap((c) => (c.permission ? [{ id: c.id, name: c.permission }] : []))
    void Promise.all(wanted.map(async (w) => [w.id, await readPermission(w.name)] as const)).then((pairs) => {
      if (current) setPermissions(Object.fromEntries(pairs))
    })
    return () => {
      current = false
    }
  }, [rows])

  const count = (s: CapabilityStatus): number => rows.filter((r) => r.detection.status === s).length
  const shown = filter === 'all' ? rows : rows.filter((r) => r.detection.status === filter)

  return (
    <Plate
      index="Nº 0001"
      title="Capability matrix"
      actions={
        <Button size="sm" icon="refresh" onClick={() => setRows(detectAll())}>
          Probe again
        </Button>
      }
    >
      <div className={styles.body}>
        <div className={styles.tools}>
          <p className={styles.tally} role="status">
            <span>{count('supported')} supported</span>
            <span>{count('partial')} partial</span>
            <span>{count('unsupported')} unsupported</span>
          </p>
          <Segmented
            label="Show"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All ${rows.length}` },
              { value: 'supported', label: 'Supported' },
              { value: 'partial', label: 'Partial' },
              { value: 'unsupported', label: 'Missing' },
            ]}
          />
        </div>
        <Table caption="Capabilities probed in this browser" dense minWidth={0} className={stacked.stack}>
          <THead>
            <Tr>
              <Th>Capability</Th>
              <Th>Status</Th>
              <Th>Permission</Th>
              <Th>When missing, the app…</Th>
              <Th>Typically in</Th>
            </Tr>
          </THead>
          <TBody>
            {shown.map(({ capability, detection }) => {
              const stamp = STAMP[detection.status]
              return (
                <Tr key={capability.id} flag={detection.status === 'supported' ? 'ok' : detection.status === 'partial' ? 'warn' : undefined}>
                  <Td>
                    <span className={styles.name}>{capability.name}</span>
                    <code className={styles.method}>{capability.method}</code>
                  </Td>
                  <Td>
                    <StatusDot tone={stamp.tone} label={stamp.label} />
                    <span className={styles.note}>{detection.note}</span>
                  </Td>
                  <Td>
                    <span className={stacked.label}>Permission</span>
                    {capability.permission ? <Permission reading={permissions[capability.id]} /> : <span className="muted">none</span>}
                  </Td>
                  <Td className={styles.cell}>
                    <span className={stacked.label}>When missing, the app…</span>
                    {capability.degrade}
                  </Td>
                  <Td className={styles.cell}>
                    <span className={stacked.label}>Typically in</span>
                    {capability.typicallyIn}
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
        <p className={styles.foot}>
          The status column is measured in this browser just now. The &quot;Typically in&quot; column is general knowledge and goes stale: verify on{' '}
          <a href="https://developer.mozilla.org/en-US/docs/Web/API" target="_blank" rel="noopener noreferrer">
            MDN
          </a>{' '}
          or{' '}
          <a href="https://caniuse.com" target="_blank" rel="noopener noreferrer">
            caniuse
          </a>{' '}
          before you rely on it. A present property is not a working feature: Periodic Background Sync exists in a Chromium tab and still does nothing until the app is installed.
        </p>
      </div>
    </Plate>
  )
}
