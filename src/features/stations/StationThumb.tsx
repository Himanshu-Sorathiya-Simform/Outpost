import { useState } from 'react'
import { API } from '@shared/contracts'
import { cx } from '@/ui'
import styles from './StationThumb.module.css'

export interface StationThumbProps {
  code: string
  variant?: 'thumb' | 'hero'
  className?: string
}

/** Survey image for a station. Lazy, and when it cannot load (offline, not stored) it says so instead of leaving a broken icon. */
export function StationThumb({ code, variant = 'thumb', className }: StationThumbProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading')
  return (
    <span className={cx(styles.frame, styles[variant], state === 'loading' && styles.loading, className)}>
      {state === 'failed' ? (
        <span className={styles.fallback} role={variant === 'hero' ? 'img' : undefined} aria-label={variant === 'hero' ? `Survey image for ${code} could not be loaded` : undefined} aria-hidden={variant === 'hero' ? undefined : true}>
          {variant === 'hero' ? 'Survey image not available' : 'No image'}
        </span>
      ) : (
        <img
          src={API.media.station(code)}
          alt={variant === 'hero' ? `Survey contour map for ${code}` : ''}
          loading={variant === 'hero' ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      )}
    </span>
  )
}
