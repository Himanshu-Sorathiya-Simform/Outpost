import { useEffect, useState, type RefObject } from 'react'
import { Meter } from '@/ui'
import styles from './ReadProgress.module.css'

/** How much of the article has come into view: 0 before its top reaches the bottom of the window, 100 when its end does. */
function progressOf(el: HTMLElement): number {
  const { top, height } = el.getBoundingClientRect()
  if (height <= 0) return 0
  return Math.round(Math.min(1, Math.max(0, (window.innerHeight - top) / height)) * 100)
}

/** A strip pinned under the telemetry bar that fills as the chapter is read. Scroll work is throttled to one update per frame. */
export function ReadProgress({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    let frame = 0
    const update = (): void => {
      frame = 0
      if (targetRef.current) setPercent(progressOf(targetRef.current))
    }
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
    }
  }, [targetRef])

  return (
    <div className={styles.strip}>
      <Meter label="Read" value={percent} segments={40} tone="ink" size="sm" />
    </div>
  )
}
