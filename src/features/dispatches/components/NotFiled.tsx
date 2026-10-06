import type { AppError } from '@/lib/errors/app-error'
import { ErrorState, LinkButton, PageHeader, Plate, cx } from '@/ui'
import { dispatchIndex } from '../format'
import { notFiledTitle, reasonFor, type NotFiledReason } from '../notFiled'
import styles from './NotFiled.module.css'

const ROWS: Array<{ reason: NotFiledReason; name: string; text: string }> = [
  { reason: 'missing', name: 'Does not exist', text: 'The relay answered and has no record under this id. It was never filed, or it was pruned: the relay keeps the newest 1000.' },
  { reason: 'unreachable', name: 'Relay did not answer', text: 'Nothing came back in time, or the relay faulted. The dispatch may well exist. Try again.' },
  { reason: 'unstored', name: 'Not stored for offline use', text: 'There is no signal and this device never kept a copy of this dispatch. Dispatches are stored once you have opened them with a link.' },
]

export interface NotFiledProps {
  id: string
  error: AppError
  onRetry: () => void
  retrying: boolean
  backTo: string
}

/** The dispatch page when there is nothing to show: says which of the three situations this is, then the detail. */
export function NotFiled({ id, error, onRetry, retrying, backTo }: NotFiledProps) {
  const reason = reasonFor(error)
  return (
    <>
      <PageHeader
        className={styles.head}
        eyebrow={`${dispatchIndex(id)} / ${reason === 'missing' ? 'Not filed' : 'Not on screen'}`}
        title={notFiledTitle(id, error)}
        description={reason ? ROWS.find((r) => r.reason === reason)?.text : undefined}
        actions={
          <LinkButton to={backTo} icon="arrow-left">
            Back to the log
          </LinkButton>
        }
      />
      <div className={styles.body}>
        <ErrorState error={error} onRetry={onRetry} retrying={retrying} />
        {reason ? (
          <Plate index="Fig. 1" title="Three ways to see nothing" surface="sunk">
            <ol className={styles.rows}>
              {ROWS.map((row) => (
                <li key={row.reason} className={cx(styles.row, row.reason === reason && styles.here)} aria-current={row.reason === reason ? 'true' : undefined}>
                  <span className={styles.name}>
                    {row.name}
                    {row.reason === reason ? <span className={styles.flag}>This one</span> : null}
                  </span>
                  <span className={styles.text}>{row.text}</span>
                </li>
              ))}
            </ol>
          </Plate>
        ) : null}
      </div>
    </>
  )
}
