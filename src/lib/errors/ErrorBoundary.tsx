import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AppError } from './app-error'
import { errorCenter } from './center'
import { toAppError } from './normalize'

export interface ErrorBoundaryProps {
  /** Render the failure. `reset` clears the boundary so the children get another attempt. */
  fallback: (error: AppError, reset: () => void) => ReactNode
  children: ReactNode
  /** Shown in the error centre, e.g. 'route:/log/:id'. */
  source?: string
  /** When any entry changes (route change, retry counter) a tripped boundary resets itself. */
  resetKeys?: readonly unknown[]
  onError?: (error: AppError, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: AppError | null
}

const sameKeys = (a: readonly unknown[] = [], b: readonly unknown[] = []): boolean => a.length === b.length && a.every((v, i) => Object.is(v, b[i]))

/** Classified errors (a failed lazy route is `chunk-load`) keep their kind; everything else is a `render` error. */
function toRenderError(thrown: unknown, source: string | undefined): AppError {
  const normalized = toAppError(thrown, source ? { source } : undefined)
  if (normalized.kind !== 'unknown' && normalized.kind !== 'unsupported') return normalized
  return new AppError({ kind: 'render', message: normalized.message, cause: thrown, context: { source } })
}

/**
 * Catches errors thrown while rendering its subtree. It does NOT catch event handlers, timers or promises —
 * those reach the error centre through the global handlers instead.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(thrown: unknown): ErrorBoundaryState {
    // Static, so it has no access to `this.props.source`; the source is added in componentDidCatch.
    return { error: toRenderError(thrown, undefined) }
  }

  componentDidCatch(thrown: unknown, info: ErrorInfo): void {
    const { source, onError } = this.props
    const error = this.state.error ?? toRenderError(thrown, source)
    // The context object is this error's own, so attaching the React component stack here is safe.
    error.context.componentStack = info.componentStack ?? undefined
    if (source && !error.context.source) error.context.source = source
    errorCenter.report(error, { source: source ?? 'render', silent: true })
    onError?.(error, info)
  }

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (this.state.error && !sameKeys(prev.resetKeys, this.props.resetKeys)) this.reset()
  }

  private reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    return error ? this.props.fallback(error, this.reset) : this.props.children
  }
}
