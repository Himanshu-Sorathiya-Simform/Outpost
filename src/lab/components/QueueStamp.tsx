import type { SeamOutcome } from '@/lib'
import { Tag } from '@/ui'

const LOOK = {
  ok: { tone: 'ok', icon: 'check', text: 'OK' },
  'not-implemented': { tone: 'neutral', icon: 'info', text: 'Not wired' },
  error: { tone: 'error', icon: 'warning', text: 'Error' },
} as const

/** What a call into src/pwa came to. A stub is neutral on purpose: it is the starting state, not a fault. */
export function OutcomeStamp({ outcome }: { outcome: SeamOutcome }) {
  const look = LOOK[outcome]
  return (
    <Tag tone={look.tone} icon={look.icon}>
      {look.text}
    </Tag>
  )
}
