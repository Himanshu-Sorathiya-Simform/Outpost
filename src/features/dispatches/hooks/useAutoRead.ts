import { useEffect, useRef } from 'react'
import type { DispatchPatcher } from './useDispatchPatcher'

/** How long the dispatch has to sit in a visible tab before it counts as read. */
export const AUTO_READ_AFTER_MS = 1500

/**
 * Marks an unread dispatch as read once it has been on screen, in a visible tab, for 1.5 s. The clock restarts when
 * the tab comes back to the front. One attempt per visit: if it fails, or the operator marks it unread again,
 * nothing retries. A failure is silent on purpose; it is not something the operator asked for.
 */
export function useAutoRead(id: string, read: boolean, change: DispatchPatcher['change']): void {
  const attempted = useRef<string | null>(null)

  useEffect(() => {
    if (read || attempted.current === id) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const fire = (): void => {
      attempted.current = id
      void change(id, { read: true }, { quiet: true })
    }
    const arm = (): void => {
      clearTimeout(timer)
      if (document.visibilityState === 'visible') timer = setTimeout(fire, AUTO_READ_AFTER_MS)
    }
    arm()
    document.addEventListener('visibilitychange', arm)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', arm)
    }
  }, [id, read, change])
}
