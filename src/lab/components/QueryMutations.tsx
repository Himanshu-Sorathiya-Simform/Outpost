import type { Mutation } from '@tanstack/react-query'
import { AppError, queryClient } from '@/lib'
import { EmptyState, Plate, TBody, THead, Table, Td, Th, Tag, TimeAgo, Tr } from '@/ui'
import { ErrorsKindStamp } from './ErrorsKindStamp'
import { useCacheTick } from './QueryModel'
import styles from './QueryMutations.module.css'

const cache = queryClient.getMutationCache()
const subscribe = (listener: () => void): (() => void) => cache.subscribe(listener)
const LIMIT = 40
const SUMMARY_CHARS = 90

function summarise(variables: unknown): string {
  if (variables === undefined) return 'none'
  let text: string
  try {
    text = JSON.stringify(variables) ?? String(variables)
  } catch {
    text = String(variables)
  }
  return text.length > SUMMARY_CHARS ? `${text.slice(0, SUMMARY_CHARS)}...` : text
}

function StatusCell({ mutation }: { mutation: Mutation }) {
  const { status, isPaused } = mutation.state
  if (isPaused) return <Tag tone="warn" icon="clock">paused</Tag>
  const tone = status === 'success' ? 'ok' : status === 'error' ? 'error' : status === 'pending' ? 'info' : 'neutral'
  return <Tag tone={tone}>{status}</Tag>
}

function ErrorCell({ mutation }: { mutation: Mutation }) {
  const { error } = mutation.state
  if (!error) return <span className={styles.none}>none</span>
  if (AppError.is(error)) {
    return (
      <span className={styles.err}>
        <ErrorsKindStamp kind={error.kind} size="sm" />
        <span>{error.userMessage}</span>
      </span>
    )
  }
  return <span>{String(error)}</span>
}

/** The mutation cache, newest first. A mutation that is paused is waiting for React to believe it is online. */
export function QueryMutations() {
  useCacheTick(subscribe)
  const all = cache.getAll()
  const shown = [...all].sort((a, b) => b.state.submittedAt - a.state.submittedAt).slice(0, LIMIT)
  const paused = all.filter((m) => m.state.isPaused).length

  return (
    <Plate index={2} title="Mutation cache" actions={paused > 0 ? <Tag tone="warn" icon="clock">{paused} paused</Tag> : undefined}>
      {shown.length === 0 ? (
        <EmptyState title="No mutations held" icon="send">
          Nothing has been written since this page loaded, or every finished mutation has been collected. Star a dispatch, mark the inbox read or file a dispatch, and a row appears here while it runs.
        </EmptyState>
      ) : (
        <>
          <Table caption="React Query mutation cache" captionHidden dense minWidth={760}>
            <THead>
              <tr>
                <Th>Key</Th>
                <Th>Status</Th>
                <Th>Variables</Th>
                <Th numeric>Attempts failed</Th>
                <Th>Error</Th>
                <Th>Submitted</Th>
              </tr>
            </THead>
            <TBody>
              {shown.map((m) => (
                <Tr key={m.mutationId} flag={m.state.status === 'error' ? 'error' : m.state.isPaused ? 'warn' : undefined}>
                  <Td className={styles.key}>{m.options.mutationKey?.join(' / ') ?? 'anonymous'}</Td>
                  <Td>
                    <StatusCell mutation={m} />
                  </Td>
                  <Td mono className={styles.vars}>
                    {summarise(m.state.variables)}
                  </Td>
                  <Td numeric>{m.state.failureCount}</Td>
                  <Td>
                    <ErrorCell mutation={m} />
                  </Td>
                  <Td nowrap>{m.state.submittedAt > 0 ? <TimeAgo at={m.state.submittedAt} /> : <span className={styles.none}>not yet</span>}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {all.length > LIMIT ? <p className={styles.more}>Showing the newest {LIMIT} of {all.length}.</p> : null}
        </>
      )}
    </Plate>
  )
}
