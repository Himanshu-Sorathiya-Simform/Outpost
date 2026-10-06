import { Link } from 'react-router'
import type { HandbookChapterMeta } from '@shared/contracts'
import { API } from '@shared/contracts'
import { StoredBadge } from './StoredBadge'
import { useStoredLookup } from './useStoredOffline'
import styles from './TableOfContents.module.css'

function Entry({ chapter, recheckKey }: { chapter: HandbookChapterMeta; recheckKey: number }) {
  const lookup = useStoredLookup(API.handbookChapter(chapter.slug), recheckKey)
  return (
    <li className={styles.entry}>
      <span className={styles.number} aria-hidden="true">
        {String(chapter.number).padStart(2, '0')}
      </span>
      <div className={styles.text}>
        <h2 className={styles.title}>
          <Link to={`/handbook/${encodeURIComponent(chapter.slug)}`}>
            <span className="sr-only">Chapter {chapter.number}: </span>
            {chapter.title}
          </Link>
        </h2>
        <p className={styles.summary}>{chapter.summary}</p>
      </div>
      <div className={styles.meta}>
        <span className={styles.read}>{chapter.readMinutes} min read</span>
        <StoredBadge lookup={lookup} />
      </div>
    </li>
  )
}

/** The contents page: numbered chapters, each with its read time and whether a copy is kept on this device. */
export function TableOfContents({ chapters, recheckKey }: { chapters: readonly HandbookChapterMeta[]; recheckKey: number }) {
  return (
    <ol className={styles.list} aria-label="Chapters">
      {[...chapters]
        .sort((a, b) => a.number - b.number)
        .map((c) => (
          <Entry key={c.slug} chapter={c} recheckKey={recheckKey} />
        ))}
    </ol>
  )
}
