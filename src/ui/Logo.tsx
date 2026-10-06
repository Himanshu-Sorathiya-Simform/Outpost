import { cx } from './internal/cx'
import styles from './Logo.module.css'

export interface LogoProps {
  variant?: 'full' | 'mark' | 'wordmark'
  /** Height of the mark in px; the wordmark scales with it. */
  size?: number
  /** Small caption under the wordmark, e.g. "Relay network". */
  caption?: string
  /** Accessible name for the mark-only variant (defaults to "Outpost"). The other variants print the word. */
  title?: string
  className?: string
}

/** The mark: a lattice mast on a ground line, flare beacon on top. Ink follows currentColor. */
function Mark({ size, title }: { size: number; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <g fill="none" stroke="currentColor" strokeLinejoin="miter">
        <path d="M16 8.5L7.85 29 M16 8.5L24.15 29" strokeWidth="2.75" />
        <path d="M11.4 20h9.2 M9.6 24.25h12.8" strokeWidth="2" />
        <path d="M2.5 29.25h27" strokeWidth="2.25" />
        <path d="M6.75 4.75a13 13 0 0 0 0 7 M25.25 4.75a13 13 0 0 1 0 7" strokeWidth="1.75" />
      </g>
      <rect x="13.25" y="3.25" width="5.5" height="5.5" fill="var(--accent)" />
    </svg>
  )
}

export function Logo({ variant = 'full', size = 28, caption, title, className }: LogoProps) {
  const showMark = variant !== 'wordmark'
  const showWord = variant !== 'mark'
  return (
    <span className={cx(styles.logo, className)} style={{ fontSize: size }}>
      {showMark ? <Mark size={size} title={showWord ? undefined : (title ?? 'Outpost')} /> : null}
      {showWord ? (
        <span className={styles.words}>
          <span className={styles.word}>Outpost</span>
          {caption ? <span className={styles.caption}>{caption}</span> : null}
        </span>
      ) : null}
    </span>
  )
}
