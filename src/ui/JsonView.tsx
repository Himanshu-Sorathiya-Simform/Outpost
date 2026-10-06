import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CopyButton } from './CopyButton'
import { cx } from './internal/cx'
import styles from './JsonView.module.css'

const PAGE = 100

interface Signal {
  version: number
  open: boolean
}
const SignalContext = createContext<Signal>({ version: 0, open: true })

type Kind = 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'other'

function scalar(value: unknown): { text: string; kind: Kind } | null {
  if (value === null) return { text: 'null', kind: 'null' }
  switch (typeof value) {
    case 'string':
      return { text: JSON.stringify(value), kind: 'string' }
    case 'number':
      return { text: String(value), kind: 'number' }
    case 'boolean':
      return { text: String(value), kind: 'boolean' }
    case 'undefined':
      return { text: 'undefined', kind: 'undefined' }
    case 'bigint':
      return { text: `${value}n`, kind: 'number' }
    case 'symbol':
      return { text: value.toString(), kind: 'other' }
    case 'function':
      return { text: `[Function ${value.name || 'anonymous'}]`, kind: 'other' }
    default:
      break
  }
  if (value instanceof Date) return { text: Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString(), kind: 'string' }
  if (value instanceof Error) return { text: `${value.name}: ${value.message}`, kind: 'other' }
  return null
}

function entriesOf(value: object): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.map((v, i) => [String(i), v])
  if (value instanceof Map) return [...value.entries()].map(([k, v]) => [String(k), v])
  if (value instanceof Set) return [...value.values()].map((v, i) => [String(i), v])
  return Object.entries(value)
}

function describe(value: object, count: number): string {
  if (Array.isArray(value)) return `Array(${count})`
  if (value instanceof Map) return `Map(${count})`
  if (value instanceof Set) return `Set(${count})`
  return count === 0 ? '{}' : `{ ${count} }`
}

interface NodeProps {
  name: string | null
  value: unknown
  depth: number
  expandDepth: number
  ancestors: readonly object[]
}

function Row({ name, children }: { name: string | null; children: ReactNode }) {
  return (
    <div className={styles.row}>
      {name !== null ? <span className={styles.key}>{name}</span> : null}
      {name !== null ? <span className={styles.colon}>: </span> : null}
      {children}
    </div>
  )
}

function Node({ name, value, depth, expandDepth, ancestors }: NodeProps) {
  const sig = useContext(SignalContext)
  const [open, setOpen] = useState(depth < expandDepth)
  const [shown, setShown] = useState(PAGE)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setOpen(sig.open)
  }, [sig.version, sig.open])

  const s = scalar(value)
  if (s) {
    return (
      <Row name={name}>
        <span className={cx(styles.val, styles[s.kind])}>{s.text}</span>
      </Row>
    )
  }
  const obj = value as object
  if (ancestors.includes(obj)) {
    return (
      <Row name={name}>
        <span className={cx(styles.val, styles.other)}>[Circular]</span>
      </Row>
    )
  }
  const entries = entriesOf(obj)
  const label = describe(obj, entries.length)
  const empty = entries.length === 0
  return (
    <div className={styles.branch}>
      <div className={styles.row}>
        {empty ? (
          <span className={styles.spacer} />
        ) : (
          <button type="button" className={styles.toggle} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${name ?? 'root'}`} onClick={() => setOpen(!open)}>
            {open ? '▾' : '▸'}
          </button>
        )}
        {name !== null ? <span className={styles.key}>{name}</span> : null}
        {name !== null ? <span className={styles.colon}>: </span> : null}
        <span className={styles.summary}>{label}</span>
      </div>
      {open && !empty ? (
        <div className={styles.children}>
          {entries.slice(0, shown).map(([k, v]) => (
            <Node key={k} name={k} value={v} depth={depth + 1} expandDepth={expandDepth} ancestors={[...ancestors, obj]} />
          ))}
          {entries.length > shown ? (
            <button type="button" className={styles.more} onClick={() => setShown(shown + PAGE)}>
              show {Math.min(PAGE, entries.length - shown)} more of {entries.length - shown}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(
    value,
    (_k, v: unknown) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]'
        seen.add(v)
        if (v instanceof Map) return Object.fromEntries(v)
        if (v instanceof Set) return [...v]
      }
      if (typeof v === 'bigint') return `${v}n`
      if (v instanceof Error) return { name: v.name, message: v.message }
      return v
    },
    2,
  ) ?? String(value)
}

export interface JsonViewProps {
  value: unknown
  /** Levels opened initially (1 = only the root). */
  expandDepth?: number
  title?: string
  maxHeight?: number | string
  copy?: boolean
  className?: string
}

/** Collapsible tree for any value: parsed JSON, a React Query cache entry, an error context. Cycle-safe. */
export function JsonView({ value, expandDepth = 2, title, maxHeight = 360, copy = true, className }: JsonViewProps) {
  const [signal, setSignal] = useState<Signal>({ version: 0, open: true })
  const style: CSSProperties = { maxHeight }
  return (
    <div className={cx(styles.view, className)}>
      <div className={styles.bar}>
        <span className={styles.title}>{title ?? 'JSON'}</span>
        <span className={styles.tools}>
          <button type="button" className={styles.tool} onClick={() => setSignal((s) => ({ version: s.version + 1, open: true }))}>
            Expand all
          </button>
          <button type="button" className={styles.tool} onClick={() => setSignal((s) => ({ version: s.version + 1, open: false }))}>
            Collapse all
          </button>
          {copy ? <CopyButton value={() => safeStringify(value)} size="sm" variant="quiet" /> : null}
        </span>
      </div>
      <div className={styles.scroll} style={style} tabIndex={0} role="region" aria-label={title ?? 'JSON value'}>
        <SignalContext.Provider value={signal}>
          <Node name={null} value={value} depth={0} expandDepth={expandDepth} ancestors={[]} />
        </SignalContext.Provider>
      </div>
    </div>
  )
}
