import { useState } from 'react'
import type { UseMutationResult } from '@tanstack/react-query'
import type { PushSendResult, PushSubscriptionInfo } from '@shared/contracts'
import { useUnreadCount } from '@/features/inbox/useBadgeSync'
import type { ApiResult, AppError } from '@/lib'
import { useDispatchFeed, type PushSendInput } from '@/lib/queries'
import { Button, Disclosure, Field, Input, JsonView, Segmented, Select, Switch, Textarea } from '@/ui'
import { MutationNote } from './ServerMutationNote'
import { ServerPushActions } from './ServerPushActions'
import { buildPreview, buildRequest, draftProblem, fieldProblems, kindOf, PRESETS, presetDraft, type BadgeMode, type PresetId, type PushDraft, type Urgency } from './ServerPushDraft'
import { PUSH_GUIDE } from './ServerPushGuide'
import { ServerPushResult } from './ServerPushResult'
import styles from './ServerPushForm.module.css'

type Send = UseMutationResult<ApiResult<PushSendResult>, AppError, PushSendInput>

const URGENCIES: Array<{ value: Urgency | ''; label: string }> = [
  { value: '', label: 'Relay default (normal)' },
  { value: 'very-low', label: 'very-low' },
  { value: 'low', label: 'low' },
  { value: 'normal', label: 'normal' },
  { value: 'high', label: 'high' },
]

const BADGE_MODES: Array<{ value: BadgeMode; label: string }> = [
  { value: 'leave', label: 'Current unread' },
  { value: 'set', label: 'Set to N' },
  { value: 'none', label: 'Leave alone' },
]

/** Builds one push by hand and sends it through the relay to every subscription, or to one. */
export function ServerPushForm({ subscriptions, send }: { subscriptions: PushSubscriptionInfo[]; send: Send }) {
  const feed = useDispatchFeed({ limit: 12 })
  const unread = useUnreadCount()
  const [stored, setDraft] = useState<PushDraft>(() => presetDraft('dispatch', { dispatchId: '', target: '', ttl: '', urgency: '', delaySec: '' }))
  const set = (patch: Partial<PushDraft>): void => setDraft((d) => ({ ...d, ...patch }))

  const dispatches = feed.items
  // Until the operator picks one, the newest dispatch in the log is the one a "new dispatch" push is about.
  const newest = dispatches[0]?.id ?? ''
  const draft: PushDraft = stored.dispatchId === '' && newest !== '' ? { ...stored, dispatchId: newest } : stored
  const kind = kindOf(draft.preset)
  const chosen = dispatches.find((d) => d.id === draft.dispatchId)
  const problem = draftProblem(draft)
  const invalid = fieldProblems(draft)
  const guide = PUSH_GUIDE[draft.preset]
  const summary = PRESETS.find((p) => p.id === draft.preset)?.summary
  const request = buildRequest(draft)
  const payload = buildPreview(draft, { unread, dispatch: chosen })
  const choosePreset = (preset: PresetId): void =>
    setDraft((d) => presetDraft(preset, { dispatchId: d.dispatchId || dispatches[0]?.id || '', target: d.target, ttl: d.ttl, urgency: d.urgency, delaySec: d.delaySec }))

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!problem) send.mutate(request)
      }}
    >
      <h3 className={styles.heading}>Send a push</h3>
      <div className={styles.grid}>
        <div className={styles.col}>
          <Field label="Preset" hint={summary}>
            <Select value={draft.preset} onChange={(e) => choosePreset(e.target.value as PresetId)} options={PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
          </Field>

          {kind === 'dispatch' ? (
            <Field label="Dispatch" hint={dispatches.length === 0 ? 'The log could not be read, so type an id.' : 'The newest dispatches in the log.'}>
              {dispatches.length > 0 ? (
                <Select
                  value={draft.dispatchId}
                  onChange={(e) => set({ dispatchId: e.target.value })}
                  options={[{ value: '', label: 'Pick a dispatch' }, ...dispatches.map((d) => ({ value: d.id, label: `${d.id}  ${d.stationCode}  ${d.title}` }))]}
                />
              ) : (
                <Input value={draft.dispatchId} onChange={(e) => set({ dispatchId: e.target.value })} placeholder="dp-000123" spellCheck={false} autoComplete="off" />
              )}
            </Field>
          ) : null}

          <Field label="Title" hint={kind === 'dispatch' ? 'Empty: the relay writes it from the dispatch.' : kind === 'custom' ? 'Required.' : 'Optional for a silent push.'}>
            <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} autoComplete="off" />
          </Field>
          <Field label="Body">
            <Textarea value={draft.body} onChange={(e) => set({ body: e.target.value })} maxLength={400} rows={2} />
          </Field>
          <div className={styles.pair}>
            <Field label="URL on click">
              <Input value={draft.url} onChange={(e) => set({ url: e.target.value })} placeholder="/log" spellCheck={false} autoComplete="off" />
            </Field>
            <Field label="Tag">
              <Input value={draft.tag} onChange={(e) => set({ tag: e.target.value })} spellCheck={false} autoComplete="off" />
            </Field>
          </div>

          <Segmented label="Badge count in the payload" showLabel size="sm" value={draft.badgeMode} onChange={(badgeMode) => set({ badgeMode })} options={BADGE_MODES} />
          {draft.badgeMode === 'set' ? (
            <Field label="Badge count" labelHidden error={invalid.badgeCount}>
              <Input type="number" min={0} inputMode="numeric" value={draft.badgeCount} onChange={(e) => set({ badgeCount: e.target.value })} />
            </Field>
          ) : null}
        </div>

        <div className={styles.col}>
          <div className={styles.pair}>
            <Field label="TTL, seconds" hint="0 to 86400. Empty: 3600." error={invalid.ttl}>
              <Input type="number" min={0} max={86400} inputMode="numeric" value={draft.ttl} onChange={(e) => set({ ttl: e.target.value })} />
            </Field>
            <Field label="Delay, seconds" hint="0 to 300." error={invalid.delaySec}>
              <Input type="number" min={0} max={300} inputMode="numeric" value={draft.delaySec} onChange={(e) => set({ delaySec: e.target.value })} />
            </Field>
          </div>
          <Field label="Urgency">
            <Select value={draft.urgency} onChange={(e) => set({ urgency: e.target.value as Urgency | '' })} options={URGENCIES} />
          </Field>
          <Field label="Send to">
            <Select
              value={draft.target}
              onChange={(e) => set({ target: e.target.value })}
              options={[{ value: '', label: `Every subscription (${subscriptions.length})` }, ...subscriptions.map((s) => ({ value: s.endpointTail, label: `${s.endpointHost}  ...${s.endpointTail}` }))]}
            />
          </Field>
          <Switch checked={draft.requireInteraction} onChange={(requireInteraction) => set({ requireInteraction })} label="Require interaction" description="The notification stays until someone acts on it." />
          <ServerPushActions actions={draft.actions} onChange={(actions) => set({ actions })} />
        </div>
      </div>

      <div className={styles.send}>
        <Button type="submit" variant="primary" icon="send" loading={send.isPending} disabled={problem !== null}>
          {draft.delaySec.trim() !== '' && Number(draft.delaySec) > 0 ? `Send in ${draft.delaySec} s` : 'Send push'}
        </Button>
        {problem ? <p className={styles.problem}>{problem}</p> : null}
        <MutationNote status={send.status} error={send.error} success="The relay accepted the send. Result below." pending="Waiting for the push service" />
      </div>

      <ServerPushResult result={send.data?.data} subscriptions={subscriptions} />

      <div className={styles.preview}>
        <h3 className={styles.heading}>Payload the worker will receive</h3>
        <p className={styles.note}>
          Built here from the form, the way the relay builds it. Empty fields take the relay&rsquo;s defaults; the send time and the current unread count are only known when it sends. In the worker this is <code>event.data.json()</code>.
        </p>
        <JsonView value={payload} title="PushPayload" expandDepth={2} maxHeight={320} />
        <Disclosure summary="Request body sent to the relay" variant="rule">
          <JsonView value={request} title="POST /api/push/send" expandDepth={2} maxHeight={240} />
        </Disclosure>
      </div>

      <div className={styles.guide}>
        <h3 className={styles.heading}>Your worker, for this push: {guide.title}</h3>
        <ol>
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </form>
  )
}
