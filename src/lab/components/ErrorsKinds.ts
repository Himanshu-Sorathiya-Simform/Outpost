import type { AppErrorKind } from '@/lib'

/** How loudly a kind is stamped. Mirrors the grouping ErrorState uses, so a kind looks the same everywhere. */
export type KindTone = 'quiet' | 'warn' | 'fault'

const QUIET: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>(['not-implemented', 'unsupported', 'permission', 'aborted'])
const WARN: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>([
  'offline',
  'network',
  'timeout',
  'rate-limited',
  'unavailable',
  'cache-miss',
  'chunk-load',
  'parse',
  'conflict',
  'version-skew',
  'quota',
])

export const kindTone = (kind: AppErrorKind): KindTone => (QUIET.has(kind) ? 'quiet' : WARN.has(kind) ? 'warn' : 'fault')
