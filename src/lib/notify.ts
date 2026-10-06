import { create } from 'zustand'

/**
 * In-app toasts. Plain store so non-React code (query cache callbacks, SW message bridge) can notify.
 * The <Toaster /> in src/ui renders it. Do not confuse with OS notifications (src/pwa/notifications.ts).
 */
export type ToastTone = 'info' | 'ok' | 'warn' | 'error'

export interface ToastInput {
  tone?: ToastTone
  title: string
  message?: string
  /** Milliseconds; 0 = sticky until dismissed. Defaults: error 8000, others 4500. */
  durationMs?: number
  action?: { label: string; run: () => void }
  /** Same key replaces an existing toast instead of stacking (e.g. 'sw-update'). */
  key?: string
}
export interface Toast extends Required<Pick<ToastInput, 'title'>> {
  id: string
  key: string | null
  tone: ToastTone
  message: string | null
  durationMs: number
  action: ToastInput['action'] | null
  createdAt: number
}

interface ToastState {
  toasts: Toast[]
  push(t: ToastInput): string
  dismiss(id: string): void
  clear(): void
}

let seq = 0
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push(input) {
    const tone = input.tone ?? 'info'
    const id = `t${++seq}`
    const toast: Toast = {
      id,
      key: input.key ?? null,
      tone,
      title: input.title,
      message: input.message ?? null,
      durationMs: input.durationMs ?? (tone === 'error' ? 8000 : 4500),
      action: input.action ?? null,
      createdAt: Date.now(),
    }
    const existing = input.key ? get().toasts.find((t) => t.key === input.key) : undefined
    set((s) => ({ toasts: [...s.toasts.filter((t) => t.id !== existing?.id), toast].slice(-5) }))
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}))

export const notify = (t: ToastInput): string => useToastStore.getState().push(t)
