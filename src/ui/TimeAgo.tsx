import { formatAge, formatStamp, toDate, toIso } from './internal/format'
import { useNow } from './internal/useNow'

export interface TimeAgoProps {
  /** ISO string, epoch ms or Date. */
  at: string | number | Date
  /** Text after the age. Default "ago". */
  suffix?: string
  className?: string
}

/** "12 s ago", refreshed every second. The exact time is in the tooltip and the dateTime attribute. */
export function TimeAgo({ at, suffix = 'ago', className }: TimeAgoProps) {
  const now = useNow()
  const date = toDate(at)
  const text = date === null ? 'unknown time' : now === 0 ? formatStamp(date) : now - date.getTime() < 1000 ? 'just now' : `${formatAge(now - date.getTime())} ${suffix}`
  return (
    <time className={className} dateTime={toIso(at)} title={date ? formatStamp(date) : undefined}>
      {text}
    </time>
  )
}
