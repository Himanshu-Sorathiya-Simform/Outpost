import type { AppError } from '@/lib/errors/app-error'

// apiFetch is the only thing that feeds the query layer and it throws nothing but AppError, so say so once:
// every `error` TanStack hands back is typed AppError | null, in queries and mutations alike.
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: AppError
  }
}
