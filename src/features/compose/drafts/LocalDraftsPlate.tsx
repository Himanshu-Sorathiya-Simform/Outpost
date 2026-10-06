import { useState } from 'react'
import { useStations } from '@/lib/queries'
import { Button, Dialog, EmptyState, LinkButton, Plate, Tag } from '@/ui'
import { Notice } from '../components/Notice'
import { SubmitFeedback } from '../components/SubmitFeedback'
import { isBlankEntry, valuesFromDraft } from '../form/form-values'
import type { OutboxState } from '../outbox/useOutbox'
import { useSubmitDispatch } from '../submit/useSubmitDispatch'
import { DRAFT_CAP, type Draft } from './draft-schema'
import { draftActions, useDrafts, useDraftsPersisted } from './draft-store'
import { DraftRow } from './DraftRow'
import styles from './LocalDraftsPlate.module.css'

/** Is the draft's key missing from an outbox list that could be read? (Sent, or removed there.) */
function leftOutbox(draft: Draft, outbox: OutboxState): boolean {
  return draft.origin === 'queued' && outbox.status === 'ready' && !outbox.items.some((i) => i.id === draft.clientId)
}

/** Drafts kept in this browser. Nothing here is sent until somebody presses Send now (or the outbox takes it). */
export function LocalDraftsPlate({ outbox }: { outbox: OutboxState }) {
  const drafts = useDrafts()
  const persisted = useDraftsPersisted()
  const stations = useStations().data?.items
  const submit = useSubmitDispatch()
  const [discarding, setDiscarding] = useState<Draft | null>(null)

  const send = (d: Draft): void => submit.submit({ draftId: d.id, clientId: d.clientId, values: valuesFromDraft(d.input) })
  const askDiscard = (d: Draft): void => (isBlankEntry(valuesFromDraft(d.input)) ? draftActions.remove(d.id) : setDiscarding(d))
  const confirmDiscard = (): void => {
    if (discarding) draftActions.remove(discarding.id)
    setDiscarding(null)
  }

  return (
    <Plate
      index="Fig. 1"
      title="On this device"
      actions={
        <>
          <Tag tone="neutral">
            {drafts.length} of {DRAFT_CAP}
          </Tag>
          <LinkButton to="/file" size="sm" icon="plus">
            New dispatch
          </LinkButton>
        </>
      }
    >
      <div className={styles.body}>
        {persisted ? null : (
          <Notice tone="warn" title="Not stored">
            This browser would not store drafts. They live in memory until the tab closes.
          </Notice>
        )}
        {drafts.length === 0 ? (
          <EmptyState
            compact
            icon="file"
            title="No drafts on this device"
            action={
              <LinkButton to="/file" size="sm" icon="pen">
                File a dispatch
              </LinkButton>
            }
          >
            Whatever you start writing is kept here automatically. A dispatch that could not be sent also stays here until it is.
          </EmptyState>
        ) : (
          <ul className={styles.list} aria-label="Drafts on this device">
            {drafts.map((d) => (
              <DraftRow
                key={d.id}
                draft={d}
                stations={stations}
                sending={submit.state.status === 'sending' && submit.state.draftId === d.id}
                sendLocked={submit.pending}
                leftOutbox={leftOutbox(d, outbox)}
                onSend={() => send(d)}
                onDiscard={() => askDiscard(d)}
              >
                <div className={styles.feedback} aria-live="polite" aria-atomic="false">
                  <SubmitFeedback
                    state={submit.state}
                    draftId={d.id}
                    listFieldErrors
                    openHref={`/file?draft=${encodeURIComponent(d.id)}`}
                    onRateLimitElapsed={submit.reset}
                  />
                </div>
              </DraftRow>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={discarding !== null}
        onClose={() => setDiscarding(null)}
        size="sm"
        title="Discard this draft?"
        description="It exists only on this device. Discarding it cannot be undone."
        footer={
          <>
            <Button onClick={() => setDiscarding(null)} data-autofocus>
              Keep it
            </Button>
            <Button variant="danger" icon="trash" onClick={confirmDiscard}>
              Discard
            </Button>
          </>
        }
      >
        <p className={styles.dialogTitle}>{discarding?.input.title?.trim() || 'Untitled draft'}</p>
        {discarding?.origin === 'queued' ? (
          <p className={styles.dialogNote}>A copy is also in the outbox. Discarding the draft does not remove that copy.</p>
        ) : null}
      </Dialog>
    </Plate>
  )
}
