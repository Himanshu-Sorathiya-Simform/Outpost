import { useState } from 'react'
import type { ChaosState } from '@shared/contracts'
import { Field, formatDuration, Input, Select, StatusDot } from '@/ui'
import { matchRule, type TestMethod } from './ChaosModel'
import styles from './ChaosTester.module.css'

const METHODS: Array<{ value: TestMethod; label: string }> = (['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map((m) => ({ value: m, label: m }))

function Result({ chaos, method, path }: { chaos: ChaosState; method: TestMethod; path: string }) {
  const v = matchRule(chaos, method, path)
  if (path.trim() === '') return <StatusDot tone="idle" label="Type a path to see which rule would answer." />
  switch (v.kind) {
    case 'exempt':
      return <StatusDot tone="ok" label="Exempt. /api/_lab is never touched by chaos, so you can always turn it off." />
    case 'offline':
      return <StatusDot tone="error" label="Server offline is on: the socket is destroyed before any rule is read." />
    case 'none':
      return <StatusDot tone="ok" label="No enabled rule matches. The request is answered normally." />
    case 'rule': {
      const r = v.rule
      const delay = r.latencyMs + r.jitterMs === 0 ? 'no delay' : `${formatDuration(r.latencyMs)} to ${formatDuration(r.latencyMs + r.jitterMs)} delay`
      const fires = r.mode === 'pass' ? 'mode pass: only the delay' : `${r.mode} on ${Math.round(r.probability * 100)}% of requests`
      return <StatusDot tone="warn" label={`Rule ${v.index + 1}, "${r.label}": ${delay}, then ${fires}.`} />
    }
  }
}

/** Type a request, see which rule answers it. Mirrors the server's matching: first enabled rule wins, probability is irrelevant to the choice. */
export function ChaosTester({ chaos }: { chaos: ChaosState }) {
  const [method, setMethod] = useState<TestMethod>('GET')
  const [path, setPath] = useState('/api/dispatches')
  return (
    <div className={styles.box}>
      <h3 className={styles.title}>Would match</h3>
      <div className={styles.row}>
        <Field label="Method" className={styles.method}>
          <Select value={method} options={METHODS} onChange={(e) => setMethod(e.target.value as TestMethod)} />
        </Field>
        <Field label="Request path" className={styles.path}>
          <Input value={path} spellCheck={false} autoComplete="off" placeholder="/api/signal" onChange={(e) => setPath(e.target.value)} />
        </Field>
      </div>
      <p className={styles.result} role="status" aria-live="polite">
        <Result chaos={chaos} method={method} path={path} />
      </p>
    </div>
  )
}
