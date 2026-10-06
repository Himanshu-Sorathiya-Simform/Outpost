import { useState } from 'react'
import { EmptyState, FieldNotes, PageHeader, Plate } from '@/ui'
import { CacheBrowser } from '../components/CacheBrowser'
import { CacheMatchTester } from '../components/CacheMatchTester'
import { CachePrecheck } from '../components/CachePrecheck'
import { useCacheList } from '../observers/cache-explorer'

export default function CachesPage() {
  const [auto, setAuto] = useState(false)
  const list = useCacheList(auto)

  return (
    <>
      <PageHeader eyebrow="Lab / Nº 03" title="Caches" description="Every Cache Storage bucket for this origin and the entries inside, read straight from the browser." />
      <FieldNotes
        experiments={[
          <>Load a few pages with your worker running, then open a bucket and read the entries: which URLs did your strategy actually store, and with what status?</>,
          <>Bump the cache name in your worker from v1 to v2 and reload twice. Both buckets show; the old one is flagged until your activate handler deletes it.</>,
          <>After your worker has cached <code>/api/handbook</code>, use the match() tester on <code>/api/handbook?x=1</code>. It misses; turn on ignoreSearch and it hits. That one flag is the difference between a working and a broken offline page.</>,
          <>Turn the refresh on, then run a Bench strategy in another tab and watch counts and Date headers move.</>,
        ]}
      >
        Cache Storage is a set of named buckets of request and response pairs. Only code you write fills them: the website itself never does. This page lists what is there, lets you look inside, and lets you delete, which is
        the quickest way to see what your app does when a cache is missing. Bucket names are split into a prefix and a version so stale generations stand out.
      </FieldNotes>
      {list.support.available ? (
        <>
          <CacheBrowser list={list} auto={auto} onAutoChange={setAuto} />
          <CacheMatchTester names={list.summaries.map((s) => s.name)} tick={list.tick} />
          <CachePrecheck tick={list.tick} />
        </>
      ) : (
        <Plate index="Nº 0001" title="Buckets">
          <EmptyState icon="cache" title="Cache Storage is not available">
            {list.support.reason}
          </EmptyState>
        </Plate>
      )}
    </>
  )
}
