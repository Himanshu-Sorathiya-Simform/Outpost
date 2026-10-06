import { StatusDot } from '@/ui'
import { cacheStorageAvailable, type StoredLookup } from './useStoredOffline'

export interface StoredBadgeProps {
  lookup: StoredLookup
  className?: string
}

/**
 * "Stored on this device", told in three shapes: a filled square when a copy is in Cache Storage, a ring when there is
 * not, and a ring with its own wording when the browser cannot be asked. Words always, colour never alone.
 */
export function StoredBadge({ lookup, className }: StoredBadgeProps) {
  if (lookup.state === 'stored') return <StatusDot className={className} tone="ok" size="sm" label="Stored on this device" />
  if (lookup.state === 'not-stored') return <StatusDot className={className} tone="idle" size="sm" label="Not stored" />
  if (!lookup.settled && cacheStorageAvailable()) return <StatusDot className={className} tone="idle" size="sm" label="Checking" />
  return <StatusDot className={className} tone="idle" size="sm" label="Cannot tell" />
}
