import { useState } from 'react'
import { Button, cx } from '@/ui'
import { dispatchIndex } from '../format'
import styles from './DispatchThumb.module.css'

export interface DispatchThumbProps {
  id: string
  src: string
  /** `thumb` is decorative (the row already says what it is); `hero` carries the alt text. */
  variant?: 'thumb' | 'hero'
  className?: string
}

/**
 * The survey plate of a dispatch. The box has a fixed aspect ratio so the page does not jump while the image
 * loads, and a failed image (offline, a cache that never stored it, a 404) becomes a tile with the register
 * number instead of a broken-image glyph. Never throws, never takes the row down with it.
 */
export function DispatchThumb({ id, src, variant = 'thumb', className }: DispatchThumbProps) {
  // The failure is remembered per source and attempt: a new src gets a fresh chance, and Try again bumps the attempt.
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const attemptKey = `${src}#${attempt}`
  const broken = failedKey === attemptKey
  const hero = variant === 'hero'

  return (
    <span className={cx(styles.box, hero ? styles.hero : styles.thumb, className)}>
      {broken ? (
        <span className={styles.fallback} role={hero ? 'img' : undefined} aria-label={hero ? `Plate for ${dispatchIndex(id)} could not be loaded` : undefined}>
          <span className={styles.no}>{dispatchIndex(id)}</span>
          {hero ? (
            <>
              <span className={styles.note}>Plate not available</span>
              <Button size="sm" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
            </>
          ) : null}
        </span>
      ) : (
        <img
          key={attempt}
          className={styles.img}
          src={src}
          alt={hero ? `Survey plate for ${dispatchIndex(id)}` : ''}
          loading={hero ? 'eager' : 'lazy'}
          decoding="async"
          width={hero ? 960 : 96}
          height={hero ? 480 : 72}
          onError={() => setFailedKey(attemptKey)}
        />
      )}
    </span>
  )
}
