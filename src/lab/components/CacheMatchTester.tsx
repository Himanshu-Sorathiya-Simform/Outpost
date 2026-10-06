import { useState, type FormEvent } from 'react'
import { toAppError } from '@/lib/errors/normalize'
import type { AppError } from '@/lib/errors/app-error'
import { DEFAULT_MATCH, runMatch, type MatchOptions, type MatchResult } from '../observers/cache-match'
import { Button, Checkbox, ErrorState, Field, Input, KeyValue, Plate, Select, StatusDot } from '@/ui'
import styles from './CacheMatchTester.module.css'

function missHint(url: string, options: MatchOptions, vary: string | null): string {
  const hints: string[] = []
  if (options.method !== 'GET' && !options.ignoreMethod) hints.push('Only GET responses are stored; a POST or HEAD request misses unless ignoreMethod is on')
  if (url.includes('?') && !options.ignoreSearch) hints.push('the stored key may have a different query string: try ignoreSearch')
  if (vary !== null) hints.push(`the stored response for this URL has Vary: ${vary}, and this request's headers differ from the ones it was stored under: try ignoreVary${options.accept ? '' : ' or send Accept'}`)
  return hints.length > 0 ? `${hints.join('; ')}.` : 'Nothing in the searched caches has this URL.'
}

/** caches.match() with its options, run against the real caches: did it hit, in which bucket, on which entry. */
export function CacheMatchTester({ names, tick }: { names: string[]; tick: number }) {
  const [url, setUrl] = useState('/api/handbook')
  const [options, setOptions] = useState<MatchOptions>(DEFAULT_MATCH)
  const [result, setResult] = useState<{ result: MatchResult; url: string; options: MatchOptions; tick: number } | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof MatchOptions>(key: K, value: MatchOptions[K]): void => setOptions((o) => ({ ...o, [key]: value }))

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (url.trim() === '') return
    setBusy(true)
    try {
      setResult({ result: await runMatch(url.trim(), options), url: url.trim(), options, tick })
      setError(null)
    } catch (err) {
      setError(toAppError(err, { source: 'lab:cache-match' }))
    } finally {
      setBusy(false)
    }
  }

  const r = result?.result
  return (
    <Plate index="Nº 0002" title="match() tester">
      <div className={styles.body}>
        <form className={styles.form} onSubmit={(e) => void submit(e)}>
          <div className={styles.row}>
            <Field label="Request URL" className={styles.url}>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/api/bench/cache-only/alpha" spellCheck={false} autoComplete="off" />
            </Field>
            <Field label="Method" className={styles.select}>
              <Select value={options.method} onChange={(e) => set('method', e.target.value as MatchOptions['method'])} options={[{ value: 'GET', label: 'GET' }, { value: 'HEAD', label: 'HEAD' }, { value: 'POST', label: 'POST' }]} />
            </Field>
            <Field label="In cache" className={styles.select}>
              <Select value={options.cacheName} onChange={(e) => set('cacheName', e.target.value)} options={[{ value: '', label: 'All caches' }, ...names.map((n) => ({ value: n, label: n }))]} />
            </Field>
            <Button type="submit" variant="primary" icon="search" loading={busy}>
              Match
            </Button>
          </div>
          <div className={styles.checks}>
            <Checkbox label="ignoreSearch" checked={options.ignoreSearch} onChange={(e) => set('ignoreSearch', e.target.checked)} />
            <Checkbox label="ignoreMethod" checked={options.ignoreMethod} onChange={(e) => set('ignoreMethod', e.target.checked)} />
            <Checkbox label="ignoreVary" checked={options.ignoreVary} onChange={(e) => set('ignoreVary', e.target.checked)} />
            <Checkbox label="send Accept: application/json" checked={options.accept} onChange={(e) => set('accept', e.target.checked)} />
          </div>
        </form>
        {error ? <ErrorState compact error={error} /> : null}
        <div className={styles.result} role="status">
          {r && result ? (
            <>
              <p className={styles.verdict}>
                <StatusDot tone={r.hit ? 'ok' : 'warn'} label={r.hit ? 'HIT' : 'MISS'} />
                <span>
                  searched {r.searched} {r.searched === 1 ? 'cache' : 'caches'} in {r.ms} ms
                </span>
                {result.tick !== tick ? <span className="muted">(caches changed since this ran: match again)</span> : null}
              </p>
              {r.hit ? (
                <KeyValue
                  dense
                  items={[
                    { label: 'Cache', value: r.cacheName },
                    { label: 'Entry', value: r.key },
                    { label: 'Status', value: r.meta.opaque ? 'opaque' : `${r.meta.status} ${r.meta.statusText}`.trim() },
                    { label: 'Content-Type', value: r.meta.opaque ? 'hidden' : (r.meta.contentType ?? 'none') },
                    { label: 'Date', value: r.meta.date ?? 'none' },
                    { label: 'X-SW-Cached-At', value: r.meta.cachedAt ?? 'none' },
                  ]}
                />
              ) : (
                <p className={styles.hint}>{missHint(result.url, result.options, r.hit ? null : r.vary)}</p>
              )}
            </>
          ) : null}
        </div>
        <p className={styles.hint}>With no cache chosen the search goes through the caches in creation order and stops at the first hit, exactly as caches.match does.</p>
      </div>
    </Plate>
  )
}
