import { useId, type ReactNode } from 'react'
import { cx } from './internal/cx'
import styles from './Sparkline.module.css'

export interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  variant?: 'line' | 'step' | 'bars'
  /** Mark the newest sample with a square. */
  showLast?: boolean
  /** Fix the vertical range (e.g. 0..100 for percentages); otherwise fitted to the data. */
  min?: number
  max?: number
  /** Accessible summary. The latest value and range are appended. */
  label: string
  className?: string
}

/** Inline trend in plain SVG. currentColor draws it; flat fills only. */
export function Sparkline({ values, width = 120, height = 32, variant = 'line', showLast = true, min, max, label, className }: SparklineProps) {
  const titleId = useId()
  const pad = 3
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) {
    return <span className={cx(styles.empty, className)} role="img" aria-label={`${label}: no data`} style={{ width, height }} />
  }
  const lo = min ?? Math.min(...finite)
  const hi = max ?? Math.max(...finite)
  const span = hi - lo || 1
  const n = values.length
  const x = (i: number): number => (n === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1))
  const y = (v: number): number => height - pad - ((Math.min(Math.max(v, lo), hi) - lo) / span) * (height - 2 * pad)

  let shape: ReactNode
  if (variant === 'bars') {
    const bw = Math.max(1, (width - 2 * pad) / n - 1.5)
    shape = values.map((v, i) =>
      Number.isFinite(v) ? <rect key={i} x={pad + (i * (width - 2 * pad)) / n} y={y(v)} width={bw} height={Math.max(1, height - pad - y(v))} fill="currentColor" /> : null,
    )
  } else {
    let d = ''
    let prev: number | null = null
    values.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        prev = null
        return
      }
      if (prev === null) d += `M${x(i).toFixed(1)} ${y(v).toFixed(1)}`
      else d += variant === 'step' ? `H${x(i).toFixed(1)}V${y(v).toFixed(1)}` : `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`
      prev = v
    })
    shape = <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
  }

  const last = finite[finite.length - 1] as number
  const lastIndex = values.length - 1 - [...values].reverse().findIndex((v) => Number.isFinite(v))
  return (
    <svg className={cx(styles.spark, className)} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}>
      <title id={titleId}>{`${label}: latest ${last}, range ${Math.min(...finite)} to ${Math.max(...finite)}, ${finite.length} samples`}</title>
      <line x1={pad} x2={width - pad} y1={height - 0.75} y2={height - 0.75} stroke="var(--ink-muted)" strokeWidth={1} />
      {shape}
      {showLast && variant !== 'bars' ? <rect x={x(lastIndex) - 2.5} y={y(last) - 2.5} width={5} height={5} fill="currentColor" /> : null}
    </svg>
  )
}
