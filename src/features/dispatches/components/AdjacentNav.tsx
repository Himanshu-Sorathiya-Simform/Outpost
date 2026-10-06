import { Link } from 'react-router'
import type { Dispatch } from '@shared/contracts'
import { Icon } from '@/ui'
import type { LogLinkState } from '../filters'
import { dispatchIndex, dispatchPath } from '../format'
import type { Neighbours } from '../hooks/cachedCopies'
import styles from './AdjacentNav.module.css'

export interface AdjacentNavProps {
  neighbours: Neighbours | null
  linkState: LogLinkState
}

function Step({ dispatch, label, side, linkState }: { dispatch: Dispatch; label: string; side: 'newer' | 'older'; linkState: LogLinkState }) {
  return (
    <Link to={dispatchPath(dispatch.id)} state={linkState} className={styles.step} data-side={side} rel={side === 'newer' ? 'prev' : 'next'}>
      <span className={styles.label}>
        {side === 'newer' ? <Icon name="arrow-left" size={14} /> : null}
        {label}
        {side === 'older' ? <Icon name="arrow-right" size={14} /> : null}
      </span>
      <span className={styles.no}>{dispatchIndex(dispatch.id)}</span>
      <span className={styles.title}>{dispatch.title}</span>
    </Link>
  )
}

/** Newer and older entries from the list already in memory. Renders nothing when the list is not cached. */
export function AdjacentNav({ neighbours, linkState }: AdjacentNavProps) {
  if (!neighbours || (!neighbours.newer && !neighbours.older)) return null
  return (
    <nav className={styles.nav} aria-label="Neighbouring dispatches in the list you came from">
      {neighbours.newer ? <Step dispatch={neighbours.newer} label="Newer" side="newer" linkState={linkState} /> : <span />}
      {neighbours.older ? <Step dispatch={neighbours.older} label="Older" side="older" linkState={linkState} /> : <span />}
    </nav>
  )
}
