import { Link } from 'react-router'
import type { Dispatch } from '@shared/contracts'
import type { ResponseMeta } from '@/lib/api/types'
import type { AppError } from '@/lib/errors/app-error'
import { LinkButton, PageHeader, ProvenanceChip, SeverityStamp, Tag, TimeAgo, formatStamp } from '@/ui'
import type { LogLinkState } from '../filters'
import { dispatchIndex, paragraphsOf } from '../format'
import type { Neighbours } from '../hooks/cachedCopies'
import { useAutoRead } from '../hooks/useAutoRead'
import { useDispatchPatcher } from '../hooks/useDispatchPatcher'
import { useShareDispatch } from '../hooks/useShareDispatch'
import { AdjacentNav } from './AdjacentNav'
import { DispatchActions } from './DispatchActions'
import { DispatchThumb } from './DispatchThumb'
import { FreshnessNotice } from './FreshnessNotice'
import { Locator } from './Locator'
import { RecordPlate } from './RecordPlate'
import styles from './DispatchView.module.css'

export interface DispatchViewProps {
  dispatch: Dispatch
  /** Provenance of the copy on screen. A list page's meta when the copy came from the list, not from the detail request. */
  meta: ResponseMeta | undefined
  /** The copy came from a cached list page because the detail request failed or is waiting for a signal. */
  fromList: boolean
  showProvenance: boolean
  refetchError: AppError | null
  paused: boolean
  fetching: boolean
  onRetry: () => void
  neighbours: Neighbours | null
  linkState: LogLinkState
  backTo: string
}

/** One dispatch in full: header, actions, plate, body in the reading face, and the record behind it. */
export function DispatchView({ dispatch: d, meta, fromList, showProvenance, refetchError, paused, fetching, onRetry, neighbours, linkState, backTo }: DispatchViewProps) {
  const patcher = useDispatchPatcher()
  const sharing = useShareDispatch(d)
  useAutoRead(d.id, d.read, patcher.change)

  return (
    <>
      <PageHeader
        className={styles.head}
        eyebrow={`${dispatchIndex(d.id)} / Dispatch`}
        title={d.title}
        actions={
          <LinkButton to={backTo} icon="arrow-left" variant="quiet">
            Back to the log
          </LinkButton>
        }
        meta={
          <>
            <SeverityStamp severity={d.severity} size="lg" />
            <span className={styles.fact}>
              Station{' '}
              <Link to={`/stations/${encodeURIComponent(d.stationCode)}`} className={styles.station}>
                {d.stationCode}
              </Link>
            </span>
            <span className={styles.fact}>Filed by {d.filedBy}</span>
            <span className={styles.fact}>
              <time dateTime={d.filedAt}>{formatStamp(d.filedAt)}</time> (<TimeAgo at={d.filedAt} />)
            </span>
            {d.read ? null : <Tag tone="accent">Unread</Tag>}
            {d.acked ? (
              <Tag tone="ok" icon="check">
                Acknowledged
              </Tag>
            ) : null}
            {d.starred ? (
              <Tag tone="warn" icon="star">
                Starred
              </Tag>
            ) : null}
          </>
        }
      />

      <div className={styles.tools}>
        <DispatchActions dispatch={d} patcher={patcher} sharing={sharing} />
        {showProvenance ? <ProvenanceChip meta={meta} /> : null}
      </div>

      <div className={styles.status} role="status" aria-live="polite">
        <FreshnessNotice subject={fromList ? 'list entry' : 'dispatch'} meta={meta} hasData refetchError={refetchError} paused={paused} onRetry={onRetry} retrying={fetching} />
      </div>

      <div className={styles.layout}>
        <article className={styles.article}>
          <figure className={styles.plate}>
            <DispatchThumb id={d.id} src={d.imageUrl} variant="hero" />
            <figcaption className={styles.figcaption}>Fig. 1 / Survey plate, {d.stationCode}</figcaption>
          </figure>
          <div className={`prose ${styles.body}`}>
            {paragraphsOf(d.body).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {d.tags.length > 0 ? (
            <ul className={styles.tags} aria-label="Tags">
              {d.tags.map((tag) => (
                <li key={tag}>
                  <Tag>{tag}</Tag>
                </li>
              ))}
            </ul>
          ) : null}
          <AdjacentNav neighbours={neighbours} linkState={linkState} />
        </article>

        <aside className={styles.aside} aria-label="Record and position">
          <RecordPlate dispatch={d} meta={fromList ? undefined : meta} />
          {d.coords ? (
            <section className={styles.position} aria-labelledby="position-heading">
              <h2 id="position-heading" className={styles.positionHead}>
                Position
              </h2>
              <Locator coords={d.coords} />
            </section>
          ) : (
            <p className={styles.noPosition}>No position was recorded with this dispatch.</p>
          )}
        </aside>
      </div>
    </>
  )
}
