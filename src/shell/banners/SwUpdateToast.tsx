import { useEffect } from 'react'
import { AppError, callSeam, notify, useToastStore } from '@/lib'
import { pwa, usePwaStore } from '@/pwa'

const TOAST_KEY = 'sw-update'

function applyUpdate(): void {
  callSeam('registration.applyUpdate', () => pwa.registration.applyUpdate()).catch((error: unknown) => {
    // callSeam has already logged the attempt and reported real failures. A stub is an expected state: say so quietly.
    if (AppError.is(error) && error.kind === 'not-implemented') {
      notify({ tone: 'info', title: 'Update is not wired up yet', message: 'registration.applyUpdate() in src/pwa/registration.ts is still a stub.' })
    }
  })
}

/**
 * "A new version is waiting": driven entirely by usePwaStore.updateAvailable, which only the learner's code sets.
 * The toast is sticky and removes itself when the flag clears (the new worker took over).
 */
export function SwUpdateToast(): null {
  const updateAvailable = usePwaStore((s) => s.updateAvailable)

  useEffect(() => {
    if (updateAvailable) {
      notify({
        key: TOAST_KEY,
        tone: 'info',
        durationMs: 0,
        title: 'Update ready',
        message: 'A new version has been downloaded and is waiting. Old tabs keep running the old code until it takes over.',
        action: { label: 'Update', run: applyUpdate },
      })
      return
    }
    const { toasts, dismiss } = useToastStore.getState()
    const existing = toasts.find((t) => t.key === TOAST_KEY)
    if (existing) dismiss(existing.id)
  }, [updateAvailable])

  return null
}
