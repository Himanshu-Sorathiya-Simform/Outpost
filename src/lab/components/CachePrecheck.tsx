import { useEffect, useState } from 'react'
import { cachedHandbookSlugs, countByPrefix, runMatch } from '../observers/cache-match'
import { EmptyState, Loader, Plate, StatusDot } from '@/ui'
import styles from './CachePrecheck.module.css'

interface Line {
  label: string
  hit: boolean
  where: string
}

const FIXED = ['/api/bench/cache-only/alpha', '/api/bench/cache-only/beta', '/api/bench/cache-only/gamma', '/api/handbook']
const SHELL = ['/offline', '/']

async function readLines(): Promise<{ lines: Line[]; slugsKnown: boolean }> {
  const slugs = await cachedHandbookSlugs()
  const urls = [...FIXED, ...(slugs ?? []).map((s) => `/api/handbook/${s}`), ...SHELL]
  const matches = await Promise.all(urls.map((u) => runMatch(u)))
  const lines: Line[] = urls.map((label, i) => {
    const m = matches[i]
    return { label, hit: m?.hit === true, where: m?.hit ? m.cacheName : 'not in any cache' }
  })
  const assets = await countByPrefix('/assets/')
  lines.push({ label: '/assets/*', hit: assets.entries > 0, where: assets.entries > 0 ? `${assets.entries} entries in ${assets.caches} ${assets.caches === 1 ? 'cache' : 'caches'}` : 'none stored' })
  return { lines, slugsKnown: slugs !== null }
}

/** The URLs this app most depends on when offline, looked up the way the page would: HIT or MISS. */
export function CachePrecheck({ tick }: { tick: number }) {
  const [state, setState] = useState<Awaited<ReturnType<typeof readLines>> | null>(null)

  useEffect(() => {
    let current = true
    void readLines().then((next) => current && setState(next))
    return () => {
      current = false
    }
  }, [tick])

  return (
    <Plate index="Nº 0003" title="Precheck: is the app kit cached?" aria-busy={state === null}>
      <div className={styles.body}>
        {state === null ? (
          <div role="status">
            <Loader label="Looking up URLs" size="sm" />
          </div>
        ) : (
          <>
            <ul className={styles.list} aria-label="Cache lookups">
              {state.lines.map((l) => (
                <li key={l.label} className={styles.row}>
                  <span className={styles.url}>{l.label}</span>
                  <StatusDot tone={l.hit ? 'ok' : 'warn'} label={l.hit ? 'HIT' : 'MISS'} />
                  <span className={styles.where}>{l.where}</span>
                </li>
              ))}
            </ul>
            {state.lines.every((l) => !l.hit) ? (
              <EmptyState compact icon="cache" title="Nothing on the list is cached">
                Every lookup missed, so the app as a whole would fail offline. Precache the shell and the routes you want to work without a signal.
              </EmptyState>
            ) : null}
            {!state.slugsKnown ? <p className={styles.hint}>Chapter pages are not listed: the handbook index is not cached, so their slugs are unknown. Cache /api/handbook and they appear here.</p> : null}
            <p className={styles.hint}>A lookup is a plain GET match across all caches, the same call a fetch handler makes first.</p>
          </>
        )}
      </div>
    </Plate>
  )
}
