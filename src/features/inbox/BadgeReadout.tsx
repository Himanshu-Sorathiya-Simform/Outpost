import { useBridgeLog } from '@/lib/bridge/seam'
import { useLabTruth } from '@/lib/queries'
import { SeamStatus } from '@/shell'
import { Button, ErrorState, KeyValue, Plate, Tag, TimeAgo } from '@/ui'
import { isBadgeEntry, requestedBadgeValue, useRecordUnread, useUnreadSamples } from './badge-history'
import styles from './BadgeReadout.module.css'

export interface BadgeReadoutProps {
  /** The unread count the screen is showing right now. `undefined` until the first summary arrives. */
  unread: number | undefined
}

type Verdict = { tone: 'ok' | 'warn' | 'neutral'; text: string }

/** Puts the three numbers side by side so a disagreement is visible: the screen, what the OS badge was told, the server. */
export function BadgeReadout({ unread }: BadgeReadoutProps) {
  useRecordUnread(unread)
  const last = useBridgeLog((s) => s.entries.find(isBadgeEntry))
  const samples = useUnreadSamples((s) => s.samples)
  const truth = useLabTruth({ enabled: false })
  const serverUnread = truth.data?.inbox.unread

  const asked = last ? requestedBadgeValue(last, samples) : null
  const value = asked === null ? 'value not captured' : last?.feature === 'badge.clear' ? '0 (clear)' : String(asked)
  const askedText = !last ? 'no call yet' : last.outcome === 'ok' ? value : `${value}, not applied`

  const verdict: Verdict = (() => {
    if (!last) return { tone: 'neutral', text: 'This tab has not asked for a badge yet. It does so whenever the unread count changes.' }
    if (last.outcome === 'not-implemented') return { tone: 'neutral', text: 'The badge seam is still a stub, so the OS badge has not been touched. Expected until src/pwa/badge.ts is written.' }
    if (last.outcome === 'error') return { tone: 'warn', text: `The last badge call failed (${last.error?.kind ?? 'unknown'}). The OS badge may be out of date.` }
    if (asked !== null && unread !== undefined && asked !== unread) return { tone: 'warn', text: `The OS badge was last set to ${asked}; the screen says ${unread}.` }
    if (serverUnread !== undefined && unread !== undefined && serverUnread !== unread) return { tone: 'warn', text: `The server counts ${serverUnread} unread; the screen says ${unread}.` }
    return { tone: 'ok', text: 'Screen and badge agree.' }
  })()

  return (
    <Plate
      index="Fig. 1"
      title="Badge"
      actions={<SeamStatus feature="badge" />}
      footer={
        <span className={styles.foot}>
          Badge calls come from useBadgeSync, 300 ms after the count changes.
        </span>
      }
    >
      <KeyValue
        dense
        items={[
          { label: 'On screen', value: unread === undefined ? 'unknown' : `${unread} unread` },
          {
            label: 'Asked of the OS',
            value: (
              <span className={styles.asked}>
                {askedText}
                {last ? (
                  <>
                    {' '}
                    <TimeAgo at={last.at} />
                  </>
                ) : null}
              </span>
            ),
          },
          { label: 'Server count', value: serverUnread === undefined ? 'not checked' : `${serverUnread} unread` },
        ]}
      />
      <div className={styles.verdict} role="status">
        <Tag tone={verdict.tone === 'neutral' ? 'neutral' : verdict.tone}>{verdict.tone === 'ok' ? 'Agree' : verdict.tone === 'warn' ? 'Differs' : 'Idle'}</Tag>
        <p>{verdict.text}</p>
      </div>
      {truth.error ? <ErrorState compact error={truth.error} /> : null}
      <Button size="sm" icon="refresh" loading={truth.isFetching} onClick={() => void truth.refetch()}>
        Ask the server
      </Button>
    </Plate>
  )
}
