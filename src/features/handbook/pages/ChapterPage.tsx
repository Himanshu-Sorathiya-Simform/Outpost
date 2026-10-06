import { useRef } from 'react'
import { useParams } from 'react-router'
import { API, type HandbookChapter, type HandbookChapterMeta } from '@shared/contracts'
import { useLabSetting } from '@/lib'
import { useHandbookChapter, useHandbookIndex } from '@/lib/queries'
import { usePageTitle } from '@/shell'
import { Button, EmptyState, ErrorState, LinkButton, PageHeader, ProvenanceChip, Skeleton, Tag, cx } from '@/ui'
import { FreshnessNote } from '@/features/stations/FreshnessNote'
import { currentFailure } from '@/features/stations/freshness'
import { RetryNote } from '@/features/stations/RetryNote'
import { ChapterBlocks } from '../ChapterBlocks'
import { ChapterNav } from '../ChapterNav'
import { EditionWarning } from '../EditionWarning'
import { NotStored, isNotStoredError, type StoredChapterLink } from '../NotStored'
import { ReadProgress } from '../ReadProgress'
import { ShareChapterButton } from '../ShareChapterButton'
import { StoredBadge } from '../StoredBadge'
import { useStoredLookup, useStoredOfflineMany } from '../useStoredOffline'
import styles from './ChapterPage.module.css'

function NoSuchChapter({ slug }: { slug: string }) {
  return (
    <>
      <PageHeader eyebrow="Register / Handbook" title="No such chapter" />
      <EmptyState title={`The handbook has no chapter called ${slug}`} icon="book" action={<LinkButton to="/handbook" icon="arrow-left">Contents</LinkButton>}>
        The relay answered, and no chapter goes by that name in this edition.
      </EmptyState>
    </>
  )
}

function Reading({ chapter, index }: { chapter: HandbookChapter; index: readonly HandbookChapterMeta[] | undefined }) {
  const article = useRef<HTMLElement>(null)
  return (
    <>
      <ReadProgress targetRef={article} />
      <article ref={article} className={cx('prose', styles.article)} aria-label={chapter.title}>
        <ChapterBlocks blocks={chapter.blocks} />
      </article>
      {index ? <ChapterNav chapters={index} slug={chapter.slug} /> : null}
    </>
  )
}

export default function ChapterPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const query = useHandbookChapter(slug || undefined)
  const index = useHandbookIndex()
  const showProvenance = useLabSetting('showProvenance')
  const { data: chapter, isFetching, dataUpdatedAt } = query
  const error = currentFailure(query)
  const chapters = index.data?.chapters
  const here = useStoredLookup(API.handbookChapter(slug), dataUpdatedAt)
  const stored = useStoredOfflineMany((chapters ?? []).map((c) => API.handbookChapter(c.slug)), dataUpdatedAt)
  usePageTitle(chapter ? `${chapter.number}. ${chapter.title}` : undefined)
  const retry = (): void => {
    void query.refetch()
    if (index.isError) void index.refetch()
  }

  if (!chapter) {
    if (error?.kind === 'not-found') return <NoSuchChapter slug={slug} />
    if (error) {
      const storedLinks: StoredChapterLink[] | undefined = chapters?.filter((c) => stored.states[API.handbookChapter(c.slug)] === 'stored').map(({ slug: s, number, title }) => ({ slug: s, number, title }))
      return (
        <>
          <PageHeader eyebrow="Register / Handbook" title="Chapter unavailable" />
          {isNotStoredError(error) ? (
            <NotStored error={error} subject="this chapter" onRetry={retry} retrying={isFetching} stored={storedLinks} />
          ) : (
            <ErrorState error={error} onRetry={retry} retrying={isFetching} actions={<LinkButton to="/handbook" variant="quiet" size="sm" icon="arrow-left">Contents</LinkButton>} />
          )}
        </>
      )
    }
    return (
      <>
        <PageHeader eyebrow="Register / Handbook" title="Opening chapter" />
        <div className={styles.loading} role="status" aria-label="Loading the chapter">
          <Skeleton variant="title" width="50%" />
          <Skeleton lines={8} />
        </div>
        <RetryNote failureCount={query.failureCount} noun="chapter" />
      </>
    )
  }

  const total = chapters?.length
  const mismatch = index.data !== undefined && index.data.edition !== chapter.edition

  return (
    <>
      <PageHeader
        eyebrow={total ? `Handbook / Chapter ${chapter.number} of ${total}` : `Handbook / Chapter ${chapter.number}`}
        title={chapter.title}
        description={chapter.summary}
        actions={
          <>
            <LinkButton to="/handbook" icon="arrow-left">
              Contents
            </LinkButton>
            <ShareChapterButton slug={chapter.slug} title={chapter.title} summary={chapter.summary} />
            <Button icon="refresh" loading={isFetching} onClick={retry}>
              Refresh
            </Button>
          </>
        }
        meta={
          <>
            <Tag tone={mismatch ? 'warn' : 'accent'} solid={!mismatch}>
              Edition {chapter.edition}
            </Tag>
            <Tag>{chapter.readMinutes} min read</Tag>
            <StoredBadge lookup={here} />
            {showProvenance ? <ProvenanceChip meta={query.meta} /> : null}
          </>
        }
      />
      {mismatch && index.data ? <EditionWarning chapterEdition={chapter.edition} indexEdition={index.data.edition} /> : null}
      <FreshnessNote noun="chapter" meta={query.meta} dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} error={error} failureCount={query.failureCount} onRetry={retry} />
      <Reading chapter={chapter} index={chapters} />
    </>
  )
}
