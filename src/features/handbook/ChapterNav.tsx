import { Link } from 'react-router'
import type { HandbookChapterMeta } from '@shared/contracts'
import { Icon } from '@/ui'
import styles from './ChapterNav.module.css'

function Step({ chapter, dir }: { chapter: HandbookChapterMeta | undefined; dir: 'prev' | 'next' }) {
  if (!chapter) return <span className={styles.empty} aria-hidden="true" />
  return (
    <Link to={`/handbook/${encodeURIComponent(chapter.slug)}`} className={styles[dir]} rel={dir}>
      <span className={styles.dir}>
        {dir === 'prev' ? <Icon name="arrow-left" size={14} /> : null}
        {dir === 'prev' ? 'Previous' : 'Next'}, chapter {chapter.number}
        {dir === 'next' ? <Icon name="arrow-right" size={14} /> : null}
      </span>
      <span className={styles.title}>{chapter.title}</span>
    </Link>
  )
}

/** Previous and next chapter, taken from the index. */
export function ChapterNav({ chapters, slug }: { chapters: readonly HandbookChapterMeta[]; slug: string }) {
  const ordered = [...chapters].sort((a, b) => a.number - b.number)
  const at = ordered.findIndex((c) => c.slug === slug)
  if (at === -1) return null
  return (
    <nav className={styles.nav} aria-label="Chapters">
      <Step chapter={ordered[at - 1]} dir="prev" />
      <Step chapter={ordered[at + 1]} dir="next" />
    </nav>
  )
}
