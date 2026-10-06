import type { CSSProperties } from 'react'
import { CopyButton } from './CopyButton'
import { cx } from './internal/cx'
import styles from './CodeBlock.module.css'

export interface CodeBlockProps {
  code: string
  /** Shown as a small caption: "json", "http", "js". Not used for highlighting. */
  language?: string
  title?: string
  lineNumbers?: boolean
  /** Wrap long lines instead of scrolling sideways. */
  wrap?: boolean
  maxHeight?: number | string
  copy?: boolean
  className?: string
}

export function CodeBlock({ code, language, title, lineNumbers = false, wrap = false, maxHeight, copy = true, className }: CodeBlockProps) {
  const lines = code.replace(/\n$/, '').split('\n')
  const style: CSSProperties | undefined = maxHeight !== undefined ? { maxHeight } : undefined
  return (
    <figure className={cx(styles.block, className)}>
      {title || language || copy ? (
        <figcaption className={styles.bar}>
          <span className={styles.title}>
            {title}
            {title && language ? <span className={styles.lang}> / {language}</span> : language ? <span className={styles.lang}>{language}</span> : null}
          </span>
          {copy ? <CopyButton value={code} size="sm" variant="quiet" /> : null}
        </figcaption>
      ) : null}
      {/* Focusable so keyboard users can scroll it. */}
      <pre className={cx(styles.pre, wrap && styles.wrap)} style={style} tabIndex={0}>
        <code className={cx(lineNumbers && styles.numbered)}>
          {lines.map((line, i) => (
            <span key={i} className={styles.line}>
              {line || ' '}
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  )
}
