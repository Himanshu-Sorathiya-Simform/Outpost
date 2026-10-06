import { memo } from 'react'
import { Link } from 'react-router'
import type { Dispatch } from '@shared/contracts'
import { IconButton, SeverityStamp, Tag, TimeAgo, cx, formatStamp } from '@/ui'
import type { LogLinkState } from '../filters'
import { dispatchIndex, dispatchPath } from '../format'
import { DispatchThumb } from './DispatchThumb'
import styles from './DispatchRow.module.css'

/** Tags shown on a line; the rest are counted. The full set is on the dispatch. */
const VISIBLE_TAGS = 3

export interface DispatchRowProps {
  dispatch: Dispatch
  linkState: LogLinkState
  starPending: boolean
  readPending: boolean
  onToggleStar: (dispatch: Dispatch) => void
  onToggleRead: (dispatch: Dispatch) => void
}

/**
 * One line of the register. The title link is stretched over the whole row (a pseudo-element), so the row is one
 * click target while the star and read buttons stay separate controls on top of it, with no interactive element
 * nested inside another.
 */
export const DispatchRow = memo(function DispatchRow({ dispatch: d, linkState, starPending, readPending, onToggleStar, onToggleRead }: DispatchRowProps) {
  const extraTags = d.tags.length - VISIBLE_TAGS
  return (
    <li className={cx(styles.row, !d.read && styles.unread)} data-dispatch-id={d.id}>
      <span className={styles.bar} aria-hidden="true" />
      <DispatchThumb id={d.id} src={d.imageUrl} className={styles.thumb} />
      <div className={styles.main}>
        <div className={styles.meta}>
          <span className={styles.no}>{dispatchIndex(d.id)}</span>
          <SeverityStamp severity={d.severity} size="sm" flat />
          <span className={styles.station}>{d.stationCode}</span>
          <span className={styles.when}>
            <TimeAgo at={d.filedAt} className={styles.ago} />
            <span className={styles.abs} aria-hidden="true">
              {formatStamp(d.filedAt)}
            </span>
          </span>
        </div>
        <p className={styles.title}>
          <Link to={dispatchPath(d.id)} state={linkState} className={styles.link} data-row-link>
            {d.read ? null : <span className="sr-only">Unread. </span>}
            {d.title}
          </Link>
        </p>
        {d.tags.length > 0 || d.acked ? (
          <p className={styles.tags}>
            {d.acked ? (
              <Tag tone="ok" icon="check">
                Acked
              </Tag>
            ) : null}
            {d.tags.slice(0, VISIBLE_TAGS).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
            {extraTags > 0 ? <span className={styles.more}>+{extraTags}</span> : null}
          </p>
        ) : null}
      </div>
      <div className={styles.actions}>
        <IconButton
          icon="star"
          filled={d.starred}
          pressed={d.starred}
          label={d.starred ? 'Remove star' : 'Star'}
          size="sm"
          variant="quiet"
          aria-busy={starPending || undefined}
          onClick={() => onToggleStar(d)}
        />
        <IconButton
          icon={d.read ? 'eye-off' : 'eye'}
          label={d.read ? 'Mark as unread' : 'Mark as read'}
          size="sm"
          variant="quiet"
          aria-busy={readPending || undefined}
          onClick={() => onToggleRead(d)}
        />
      </div>
    </li>
  )
})
