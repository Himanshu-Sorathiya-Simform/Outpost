import type { ReactNode } from 'react'
import { useBridgeLog, type BridgeLogEntry } from '@/lib'
import { Tag, TimeAgo, cx } from '@/ui'
import styles from './SeamStatus.module.css'

export interface SeamStatusProps {
  /** A seam feature name as passed to callSeam ('badge.set'), or a prefix ('badge' matches 'badge.set' and 'badge.clear'). */
  feature: string
  /** Caption printed before the stamp. */
  label?: string
  className?: string
}

const matches = (entry: BridgeLogEntry, feature: string): boolean => entry.feature === feature || entry.feature.startsWith(`${feature}.`)

/**
 * The outcome of the most recent call into src/pwa for a feature: NOT WIRED (the stub answered), OK with its age, or
 * ERROR. "No calls yet" is shown as such, because a seam nobody has touched is not the same as a stub.
 */
export function SeamStatus({ feature, label, className }: SeamStatusProps) {
  const last = useBridgeLog((s) => s.entries.find((e) => matches(e, feature)))

  let stamp: ReactNode
  if (!last) {
    stamp = (
      <Tag tone="neutral" className={styles.idle} title={`No call to ${feature} yet`}>
        No calls yet
      </Tag>
    )
  } else if (last.outcome === 'not-implemented') {
    stamp = (
      <Tag tone="neutral" className={styles.idle} title={`${last.feature} is still a stub in src/pwa`}>
        Not wired
      </Tag>
    )
  } else if (last.outcome === 'ok') {
    stamp = (
      <Tag tone="ok" title={`${last.feature} answered in ${last.durationMs} ms`}>
        OK <TimeAgo at={last.at} />
      </Tag>
    )
  } else {
    stamp = (
      <Tag tone="error" title={last.error?.message ?? `${last.feature} failed`}>
        Error
      </Tag>
    )
  }

  return (
    <span className={cx(styles.wrap, className)}>
      {label ? <span className={styles.label}>{label}</span> : null}
      {stamp}
    </span>
  )
}
