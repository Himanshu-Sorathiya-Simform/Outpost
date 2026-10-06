import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch } from '@shared/contracts'
import { sessionPrompt, usePatchDispatch } from '@/lib/queries'

/** Time a struck row stays on screen before it leaves the list. Shorter when the user asked for less motion. */
const LEAVE_MS = 620
const LEAVE_REDUCED_MS = 380

interface Leaving {
  /** The dispatch as it was when it was actioned, so the row can still be drawn if a refetch removes it first. */
  snapshot: Dispatch
  index: number
}

export interface Triage {
  /** Unread rows in feed order, plus the rows that are mid-exit. */
  rows: Dispatch[]
  leavingIds: ReadonlySet<string>
  /** No active shift: acknowledging opens the clock-in prompt instead of sending a request. */
  signedOut: boolean
  /** Polite live-region text describing the last action. */
  announcement: string
  markRead(item: Dispatch): void
  toggleStar(item: Dispatch): void
  acknowledge(item: Dispatch): void
}

const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Quick actions for the unread list. The patch hook already updates every cache at once; what it leaves alone is the
 * list itself (an item that stops matching `unread` stays until the feed revalidates). This adds the exit: a read row
 * is kept for a moment so the strike-through can play, then dropped. A failed patch cancels the exit.
 */
export function useTriage(items: Dispatch[], signedOut: boolean): Triage {
  const patch = usePatchDispatch()
  const [leaving, setLeaving] = useState<ReadonlyMap<string, Leaving>>(new Map())
  const [announcement, setAnnouncement] = useState('')
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((t) => clearTimeout(t))
  }, [])

  const cancelExit = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.current.delete(id)
    setLeaving((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const beginExit = useCallback(
    (item: Dispatch) => {
      const index = Math.max(0, items.findIndex((i) => i.id === item.id))
      setLeaving((prev) => new Map(prev).set(item.id, { snapshot: item, index }))
      timers.current.set(
        item.id,
        setTimeout(() => cancelExit(item.id), prefersReducedMotion() ? LEAVE_REDUCED_MS : LEAVE_MS),
      )
    },
    [items, cancelExit],
  )

  const markRead = useCallback(
    (item: Dispatch) => {
      beginExit(item)
      setAnnouncement(`Marked read: ${item.title}.`)
      patch.mutateAsync({ id: item.id, patch: { read: true } }).catch(() => {
        cancelExit(item.id)
        setAnnouncement(`Could not mark read: ${item.title}. It is back in the list.`)
      })
    },
    [patch, beginExit, cancelExit],
  )

  const acknowledge = useCallback(
    (item: Dispatch) => {
      if (signedOut) {
        sessionPrompt.open('Acknowledging a dispatch needs an active shift. Clock in to continue.')
        return
      }
      beginExit(item)
      setAnnouncement(`Acknowledged: ${item.title}.`)
      patch.mutateAsync({ id: item.id, patch: { acked: true, read: true } }).catch(() => {
        cancelExit(item.id)
        setAnnouncement(`Could not acknowledge: ${item.title}. It is back in the list.`)
      })
    },
    [patch, signedOut, beginExit, cancelExit],
  )

  const toggleStar = useCallback(
    (item: Dispatch) => {
      const starred = !item.starred
      setAnnouncement(starred ? `Starred: ${item.title}.` : `Star removed: ${item.title}.`)
      patch.mutateAsync({ id: item.id, patch: { starred } }).catch(() => setAnnouncement(`Could not change the star on ${item.title}.`))
    },
    [patch],
  )

  const rows = useMemo(() => {
    const visible = items.filter((i) => !i.read || leaving.has(i.id))
    const present = new Set(visible.map((i) => i.id))
    // A refetch can drop a row that is still playing its exit; put it back where it was so the list does not jump.
    const ghosts = [...leaving.values()].filter((l) => !present.has(l.snapshot.id)).sort((a, b) => a.index - b.index)
    for (const ghost of ghosts) visible.splice(Math.min(ghost.index, visible.length), 0, ghost.snapshot)
    return visible
  }, [items, leaving])

  const leavingIds = useMemo(() => new Set(leaving.keys()), [leaving])

  return { rows, leavingIds, signedOut, announcement, markRead, toggleStar, acknowledge }
}
