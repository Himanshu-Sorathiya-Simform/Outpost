import type { ResponseSource } from '@/lib/api/types'
import { cx } from './internal/cx'
import styles from './ProvenanceChip.module.css'

export const SOURCE_LABEL: Record<ResponseSource, string> = {
  network: 'Network',
  'sw-cache': 'SW cache',
  'sw-network': 'SW network',
  'sw-fallback': 'SW fallback',
  'http-cache': 'HTTP cache',
  unknown: 'Unknown',
}

export interface SourceGlyphProps {
  source: ResponseSource
  size?: number
  className?: string
}

/**
 * Every source has its own silhouette, so the answer to "where did this come from?" survives
 * colour-blindness and greyscale:
 * network = square, sw-cache = solid diamond, sw-network = open diamond,
 * sw-fallback = triangle, http-cache = disc, unknown = dashed square.
 */
export function SourceGlyph({ source, size = 12, className }: SourceGlyphProps) {
  let shape
  switch (source) {
    case 'network':
      shape = <rect x="2" y="2" width="8" height="8" fill="currentColor" />
      break
    case 'sw-cache':
      shape = <path d="M6 .5L11.5 6 6 11.5.5 6z" fill="currentColor" />
      break
    case 'sw-network':
      shape = <path d="M6 1.4L10.6 6 6 10.6 1.4 6z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      break
    case 'sw-fallback':
      shape = <path d="M6 1L11.5 10.5H.5z" fill="currentColor" />
      break
    case 'http-cache':
      shape = <circle cx="6" cy="6" r="4.6" fill="currentColor" />
      break
    default:
      shape = <rect x="1.6" y="1.6" width="8.8" height="8.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.6" />
  }
  return (
    <svg className={cx(styles.glyph, styles[`src_${source.replace('-', '_')}`], className)} viewBox="0 0 12 12" width={size} height={size} aria-hidden="true" focusable="false">
      {shape}
    </svg>
  )
}
