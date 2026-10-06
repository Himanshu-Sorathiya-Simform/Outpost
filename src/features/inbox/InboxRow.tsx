import { Link } from 'react-router'
import type { Dispatch } from '@shared/contracts'
import { Icon, IconButton, SeverityStamp, Tag, TimeAgo, cx } from '@/ui'
import styles from './InboxRow.module.css'

export interface InboxRowProps {
  item: Dispatch
  /** The row the keyboard shortcuts act on. */
  active: boolean
  /** Already actioned; the strike-through is playing and the row is about to leave the list. */
  leaving: boolean
  registerRef: (id: string, el: HTMLElement | null) => void
  onActivate: (id: string) => void
  onRead: (item: Dispatch) => void
  onStar: (item: Dispatch) => void
  onAcknowledge: (item: Dispatch) => void
}

const EXCERPT_CHARS = 150

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length > EXCERPT_CHARS ? `${flat.slice(0, EXCERPT_CHARS).trimEnd()}...` : flat
}

/** One unread dispatch with its three quick actions. The title is a link; the row itself takes focus for j/k. */
export function InboxRow({ item, active, leaving, registerRef, onActivate, onRead, onStar, onAcknowledge }: InboxRowProps) {
  const titleId = `inbox-${item.id}`
  return (
    <li className={cx(styles.item, leaving && styles.leaving)}>
      <article
        ref={(el) => registerRef(item.id, el)}
        className={cx(styles.row, active && styles.active)}
        data-severity={item.severity}
        tabIndex={-1}
        aria-labelledby={titleId}
        onFocus={() => onActivate(item.id)}
      >
        <div className={styles.main}>
          <div className={styles.meta}>
            <SeverityStamp severity={item.severity} size="sm" flat />
            <span className={styles.station}>{item.stationCode}</span>
            <TimeAgo at={item.filedAt} className={styles.when} />
            {item.starred ? (
              <span className={styles.starred} title="Starred">
                <Icon name="star" size={14} filled />
                <span className="sr-only">Starred</span>
              </span>
            ) : null}
          </div>
          <h3 id={titleId} className={styles.title}>
            <Link to={`/log/${item.id}`} className={styles.link}>
              <span className={styles.strike}>{item.title}</span>
            </Link>
          </h3>
          <p className={styles.excerpt}>{excerpt(item.body)}</p>
        </div>
        <div className={styles.actions} role="group" aria-label={`Actions for ${item.title}`}>
          <IconButton icon="check" label="Mark read (R)" size="sm" disabled={leaving} onClick={() => onRead(item)} />
          <IconButton
            icon="star"
            label={item.starred ? 'Remove star (S)' : 'Star (S)'}
            size="sm"
            pressed={item.starred}
            filled={item.starred}
            disabled={leaving}
            onClick={() => onStar(item)}
          />
          {item.acked ? (
            <Tag tone="ok" icon="flag" className={styles.acked}>
              Acked
            </Tag>
          ) : (
            <IconButton icon="flag" label="Acknowledge (A)" size="sm" disabled={leaving} onClick={() => onAcknowledge(item)} />
          )}
        </div>
      </article>
    </li>
  )
}
