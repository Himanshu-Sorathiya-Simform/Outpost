import { Icon } from '@/ui'
import { cacheStorageAvailable, type StoredState } from './useStoredOffline'
import styles from './StoredSummary.module.css'

export interface StoredSummaryProps {
  stored: Readonly<Record<string, StoredState>>
  settled: boolean
  total: number
}

/** One line on how much of the handbook is on this device. Spoken politely when it changes (a worker may finish storing chapters). */
export function StoredSummary({ stored, settled, total }: StoredSummaryProps) {
  const states = Object.values(stored)
  const count = states.filter((s) => s === 'stored').length
  let text = 'Checking which chapters are stored on this device.'
  if (settled) {
    if (!cacheStorageAvailable() || states.every((s) => s === 'unknown')) {
      text = 'This browser is not letting the page look in Cache Storage, so it cannot say which chapters are stored.'
    } else if (count === 0) {
      text = 'No chapter is stored on this device. Nothing is kept until a service worker writes it to Cache Storage, so offline these pages will not open.'
    } else if (count === total) {
      text = `All ${total} chapters are stored on this device and will open with no signal.`
    } else {
      text = `${count} of ${total} chapters are stored on this device. The others need a signal to open.`
    }
  }
  return (
    <p className={styles.line} role="status">
      <Icon name="cache" size={16} />
      <span>{text}</span>
    </p>
  )
}
