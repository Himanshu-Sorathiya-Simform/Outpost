import type { AppError, AppErrorKind } from '@/lib/errors/app-error'

/** Three different reasons a dispatch is not on screen. They look alike and mean different things. */
export type NotFiledReason = 'missing' | 'unreachable' | 'unstored'

const UNSTORED: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>(['cache-miss', 'offline'])
const UNREACHABLE: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>(['network', 'timeout', 'unavailable', 'server', 'rate-limited'])

/** Which of the three this failure is, or null when it is something else (a parse or schema fault). */
export function reasonFor(error: AppError): NotFiledReason | null {
  if (error.kind === 'not-found') return 'missing'
  if (UNSTORED.has(error.kind)) return 'unstored'
  if (UNREACHABLE.has(error.kind)) return 'unreachable'
  return null
}

const TITLE: Record<NotFiledReason, (id: string) => string> = {
  missing: (id) => `Nothing filed under ${id}`,
  unreachable: (id) => `No answer for ${id}`,
  unstored: (id) => `${id} is not stored here`,
}

export function notFiledTitle(id: string, error: AppError): string {
  const reason = reasonFor(error)
  return reason ? TITLE[reason](id) : `Could not open ${id}`
}
