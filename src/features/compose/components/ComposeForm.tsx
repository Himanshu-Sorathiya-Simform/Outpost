import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { useStations } from '@/lib/queries'
import { Button, Dialog, Plate } from '@/ui'
import { useComposeDraft } from '../drafts/useComposeDraft'
import { useDraftsPersisted } from '../drafts/draft-store'
import { findStation, firstErrorField, type FieldErrors, type FieldKey } from '../form/validate'
import { useSubmitDispatch } from '../submit/useSubmitDispatch'
import { isBlankEntry } from '../form/form-values'
import { describeDropped } from '../form/prefill'
import { EntryFields, ParticularsFields, type FieldRefs } from './EntryFields'
import { FilingPanel } from './FilingPanel'
import { Notice } from './Notice'
import styles from './ComposeForm.module.css'

const NO_ERRORS: FieldErrors = {}

export interface ComposeFormProps {
  /** Identity of this form. Writing `?draft=` into the URL passes it along in router state, so the form is not remounted. */
  formKey: string
}

export function ComposeForm({ formKey }: ComposeFormProps) {
  const navigate = useNavigate()
  const draft = useComposeDraft()
  const persisted = useDraftsPersisted()
  const stations = useStations()
  const submit = useSubmitDispatch({ onFiled: draft.close })
  const refs = useRef<FieldRefs>({})
  const [confirming, setConfirming] = useState(false)
  const { state } = submit
  const errors = state.status === 'invalid' || state.status === 'rejected' ? state.errors : NO_ERRORS

  // Put the draft id in the URL so a reload resumes it. `state` keeps this form mounted through the replace.
  const { draftId } = draft
  useEffect(() => {
    if (draftId === null || new URLSearchParams(window.location.search).get('draft') === draftId) return
    void navigate({ search: `?draft=${draftId}` }, { replace: true, state: { composeKey: formKey } })
  }, [draftId, formKey, navigate])

  // A station that came in a link but is not on the list is dropped rather than blocking the form.
  const { stationFromLink, values, edit } = draft
  const stationItems = stations.data?.items
  useEffect(() => {
    if (stationFromLink && stationItems && values.stationId !== '' && !findStation(stationItems, values.stationId)) edit({ stationId: '' })
  }, [stationFromLink, stationItems, values.stationId, edit])

  // After a rejected attempt, focus the first field that needs attention. Edits to the same message do not move focus again.
  const focusToken = state.status === 'invalid' || state.status === 'rejected' ? state.attempt : 0
  const focusTarget = firstErrorField(errors)
  const latestTarget = useRef<FieldKey | null>(null)
  useEffect(() => {
    latestTarget.current = focusTarget
  })
  useEffect(() => {
    if (focusToken === 0 || latestTarget.current === null) return
    refs.current[latestTarget.current]?.focus()
  }, [focusToken])

  const onEdit = (patch: Partial<typeof values>, touched: FieldKey): void => {
    edit(patch)
    submit.clearFieldError(touched)
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    // Written to the device first: if anything below goes wrong, the entry is already safe.
    submit.submit({ draftId: draft.flush(), clientId: draft.clientId, values })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>): void => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      e.currentTarget.requestSubmit()
    }
  }

  const discard = (): void => {
    draft.discard()
    setConfirming(false)
    void navigate('/file', { replace: true })
  }

  const { resumed } = draft
  return (
    <>
      {draft.missing ? (
        <Notice tone="warn" title="Draft not found">
          That draft is no longer on this device. This is a blank entry.
        </Notice>
      ) : null}
      {resumed && resumed.origin === 'offline-failed' ? (
        <Notice tone="warn" title="This draft was not sent">
          <p>{resumed.lastError ?? 'The relay could not be reached.'}</p>
          <p>Sending it again is safe. It carries the same key as the first attempt, so the relay files it once.</p>
        </Notice>
      ) : null}
      {resumed && resumed.origin === 'queued' ? (
        <Notice tone="info" title="This draft is queued">
          <p>A copy is waiting in the outbox. Filing it from here as well is safe: both carry the same key and the relay files it once.</p>
        </Notice>
      ) : null}
      {draft.fromLink && !resumed ? (
        <Notice tone="info" title="Started from a link">
          <p>Choose the station and check the text before filing. Nothing has been sent.</p>
          {describeDropped(draft.dropped).map((note) => (
            <p key={note}>{note}</p>
          ))}
        </Notice>
      ) : null}

      <form className={styles.layout} onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate aria-label="New dispatch">
        <Plate index="Nº 01" title="Entry" className={styles.entry}>
          <EntryFields values={values} errors={errors} onEdit={onEdit} refs={refs} />
        </Plate>
        <Plate index="Nº 02" title="Particulars" className={styles.particulars} surface="sunk">
          <ParticularsFields values={values} errors={errors} onEdit={onEdit} refs={refs} />
        </Plate>
        <Plate index="Nº 03" title="Filing" className={styles.filing}>
          <FilingPanel
            submit={submit}
            severity={values.severity}
            draftId={draftId}
            savedAt={draft.savedAt}
            persisted={persisted}
            onDiscard={() => (isBlankEntry(values) ? discard() : setConfirming(true))}
          />
        </Plate>
      </form>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        title="Discard this draft?"
        description="The entry exists only on this device. Discarding it cannot be undone."
        footer={
          <>
            <Button onClick={() => setConfirming(false)} data-autofocus>
              Keep it
            </Button>
            <Button variant="danger" icon="trash" onClick={discard}>
              Discard
            </Button>
          </>
        }
      >
        <p className={styles.dialogText}>{values.title.trim() === '' ? 'Untitled entry' : values.title.trim()}</p>
      </Dialog>
    </>
  )
}
