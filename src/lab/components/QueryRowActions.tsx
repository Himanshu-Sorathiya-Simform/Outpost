import { IconButton } from '@/ui'
import { QUERY_ACTIONS, type QueryAction } from './QueryActions'
import type { QueryRowData } from './QueryModel'
import styles from './QueryRowActions.module.css'

export interface QueryRowActionsProps {
  row: QueryRowData
  onAction: (action: QueryAction, row: QueryRowData) => void
  onInspect?: () => void
}

/** The four cache operations as icon buttons, plus an optional inspector. Refetch is off for entries nothing can fetch. */
export function QueryRowActions({ row, onAction, onInspect }: QueryRowActionsProps) {
  return (
    <div className={styles.actions}>
      {onInspect ? <IconButton icon="eye" label={`Inspect ${row.keyText}`} size="sm" onClick={onInspect} /> : null}
      {QUERY_ACTIONS.map((a) => {
        const blocked = (a.action === 'refetch' || a.action === 'reset') && !row.refetchable
        return (
          <IconButton
            key={a.action}
            icon={a.icon}
            label={`${a.label} ${row.keyText}`}
            title={blocked ? `${a.label}: this entry was restored from disk and no screen has mounted it, so there is no query function to run` : `${a.label}: ${a.does}`}
            size="sm"
            variant={a.action === 'remove' ? 'danger' : 'ghost'}
            disabled={blocked}
            onClick={() => onAction(a.action, row)}
          />
        )
      })}
    </div>
  )
}
