import { Link } from 'react-router'
import type { AppError } from '@/lib/errors/app-error'
import { Button, Icon, LinkButton } from '@/ui'
import styles from './NotStored.module.css'

export interface StoredChapterLink {
  slug: string
  number: number
  title: string
}

export interface NotStoredProps {
  error: AppError
  /** What was being opened: "the handbook index", "chapter 4". */
  subject: string
  onRetry: () => void
  retrying: boolean
  /** Chapters that are on this device, when they can be listed. `undefined` means the list could not be worked out. */
  stored?: readonly StoredChapterLink[]
}

/** Kinds that mean "there is no link and no copy": this page is cache-only, so that is the whole story. */
export const isNotStoredError = (error: AppError): boolean => error.kind === 'cache-miss' || error.kind === 'offline'

/** The handbook's offline failure. It says what is true: there is no stored copy, and here is what is stored. */
export function NotStored({ error, subject, onRetry, retrying, stored }: NotStoredProps) {
  return (
    <div className={styles.box} role="alert">
      <p className={styles.stamp}>
        <Icon name="offline" size={16} />
        Not stored for offline use
      </p>
      <p className={styles.text}>
        There is no signal to fetch {subject}, and no copy of it is kept on this device. The handbook only works away from the relay for chapters that were stored beforehand.
      </p>
      <div className={styles.stored}>
        <h2 className={styles.heading}>Chapters that are stored</h2>
        {stored === undefined ? (
          <p className={styles.none}>The chapter list itself is not stored, so there is nothing to check against.</p>
        ) : stored.length === 0 ? (
          <p className={styles.none}>None. Cache Storage holds no handbook chapter on this device.</p>
        ) : (
          <ul className={styles.list}>
            {stored.map((c) => (
              <li key={c.slug}>
                <Link to={`/handbook/${encodeURIComponent(c.slug)}`}>
                  Chapter {c.number}: {c.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.actions}>
        <Button icon="refresh" loading={retrying} onClick={onRetry}>
          Try again
        </Button>
        <LinkButton to="/handbook" variant="quiet" icon="book">
          Back to the handbook
        </LinkButton>
        <span className={styles.kind}>{error.kind}</span>
      </div>
    </div>
  )
}
