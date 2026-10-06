import { useState } from 'react'
import { parseSwMessage } from '@shared/sw-protocol'
import { Button, Field, Plate, Segmented, Select, StatusDot, Textarea } from '@/ui'
import { QueueProtocolReaction } from './QueueProtocolReaction'
import { useProtocolRun, type Route } from './QueueProtocolSend'
import { templateJson, TEMPLATES } from './QueueProtocolTemplates'
import styles from './QueueProtocol.module.css'

type Inspection = { kind: 'syntax'; message: string } | { kind: 'schema'; value: unknown; valid: true } | { kind: 'schema'; value: unknown; valid: false; reason: string }

function inspect(text: string): Inspection {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (err) {
    return { kind: 'syntax', message: err instanceof Error ? err.message : 'Not JSON' }
  }
  const parsed = parseSwMessage(value)
  return parsed.ok ? { kind: 'schema', value, valid: true } : { kind: 'schema', value, valid: false, reason: parsed.reason }
}

const ROUTES: Array<{ value: Route; label: string }> = [
  { value: 'auto', label: 'Automatic' },
  { value: 'service-worker', label: 'Worker event' },
  { value: 'broadcast', label: 'Broadcast' },
]

const FIRST = TEMPLATES[0]

/**
 * Plays the worker's half of the protocol: sends a SwToPage message into the app's own bridge and shows what the app
 * did with it. The learner can check the page side before a worker exists, and again after it does.
 */
export function QueueProtocol() {
  const [templateId, setTemplateId] = useState(FIRST?.id ?? '')
  const [text, setText] = useState(FIRST ? templateJson(FIRST) : '{}')
  const [route, setRoute] = useState<Route>('auto')
  const [problem, setProblem] = useState<string | null>(null)
  const { run, send } = useProtocolRun()

  const template = TEMPLATES.find((t) => t.id === templateId)
  const inspection = inspect(text)

  const choose = (id: string): void => {
    const next = TEMPLATES.find((t) => t.id === id)
    setTemplateId(id)
    if (next) setText(templateJson(next))
    setProblem(null)
  }

  const submit = (): void => {
    if (inspection.kind === 'syntax') return
    const failure = send(inspection.value, route)
    setProblem(failure ? failure.problem : null)
  }

  return (
    <Plate index="Nº 0005" title="Protocol tester">
      <div className={styles.body}>
        <p className={styles.lede}>
          The page half of the worker protocol already exists. This sends it a message from the page, shaped like the ones a worker would post, so you can see the app react before you write the worker. The message is delivered as a <code>message</code> event on <code>navigator.serviceWorker</code>, or on the <code>outpost-sw</code> BroadcastChannel; both reach the same bridge.
        </p>
        <div className={styles.cols}>
          <div className={styles.col}>
            <Field label="Template" hint={template?.expect}>
              <Select value={templateId} onChange={(e) => choose(e.target.value)} options={TEMPLATES.map((t) => ({ value: t.id, label: t.label }))} />
            </Field>
            <Field label="Message (JSON, editable)" className={styles.editor}>
              <Textarea className={styles.editor} value={text} onChange={(e) => setText(e.target.value)} rows={9} spellCheck={false} autoComplete="off" invalid={inspection.kind === 'syntax'} />
            </Field>
            <p className={styles.verdict} role="status" aria-live="polite">
              {inspection.kind === 'syntax' ? (
                <>
                  <StatusDot tone="error" label={<strong>Not JSON, so it cannot be sent</strong>} />
                  <span className={styles.reason}>{inspection.message}</span>
                </>
              ) : inspection.valid ? (
                <StatusDot tone="ok" label={<strong>A valid SwToPage message</strong>} />
              ) : (
                <>
                  <StatusDot tone="warn" label={<strong>Not a valid SwToPage message. It can still be sent.</strong>} />
                  <span className={styles.reason}>{inspection.reason}</span>
                </>
              )}
            </p>
            <Segmented label="Deliver by" showLabel size="sm" value={route} onChange={setRoute} options={ROUTES} />
            <div className={styles.row}>
              <Button variant="primary" icon="send" disabled={inspection.kind === 'syntax'} onClick={submit}>
                Send as the worker
              </Button>
              <Button onClick={() => template && setText(templateJson(template))} disabled={!template}>
                Reset the template
              </Button>
            </div>
            {problem ? <p className={styles.problem}>{problem}</p> : null}
          </div>
          <div className={styles.col}>
            <QueueProtocolReaction run={run} />
          </div>
        </div>
      </div>
    </Plate>
  )
}
