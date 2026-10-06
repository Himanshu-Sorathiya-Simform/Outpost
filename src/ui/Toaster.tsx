import { useEffect, useRef, useState } from 'react'
import { useToastStore, type Toast, type ToastTone } from '@/lib/notify'
import { IconButton } from './Button'
import { Icon, type IconName } from './icons'
import { cx } from './internal/cx'
import styles from './Toaster.module.css'

const TONE_ICON: Record<ToastTone, IconName> = { info: 'info', ok: 'check', warn: 'warning', error: 'bug' }
const TONE_WORD: Record<ToastTone, string> = { info: 'Info', ok: 'Done', warn: 'Warning', error: 'Fault' }

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hovered || focused
  const remaining = useRef(toast.durationMs)
  const startedAt = useRef(0)

  // Count down only while neither hovered nor focused; bank what is left when pausing.
  useEffect(() => {
    if (toast.durationMs === 0 || paused) return
    startedAt.current = performance.now()
    const id = setTimeout(() => onDismiss(toast.id), remaining.current)
    return () => {
      clearTimeout(id)
      remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt.current))
    }
  }, [paused, toast.id, toast.durationMs, onDismiss])

  return (
    <li
      className={cx(styles.toast, styles[toast.tone])}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onDismiss(toast.id)
      }}
    >
      <div className={styles.tab} aria-hidden="true">
        <Icon name={TONE_ICON[toast.tone]} size={18} />
      </div>
      <div className={styles.content}>
        <p className={styles.kind}>{TONE_WORD[toast.tone]}</p>
        <p className={styles.title}>{toast.title}</p>
        {toast.message ? <p className={styles.message}>{toast.message}</p> : null}
        {toast.action ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              toast.action?.run()
              onDismiss(toast.id)
            }}
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <IconButton icon="x" label="Dismiss notification" variant="quiet" size="sm" onClick={() => onDismiss(toast.id)} />
      {toast.durationMs > 0 ? (
        <span
          className={styles.drain}
          aria-hidden="true"
          style={{ animationDuration: `${toast.durationMs}ms`, animationPlayState: paused ? 'paused' : 'running' }}
        />
      ) : null}
    </li>
  )
}

/**
 * Renders the toast store. Mount once, near the root.
 * The stack lives in the top layer (popover) so it stays above open dialogs. Announcements go
 * through two persistent sr-only live regions, because a live region that appears together with
 * its content is often not read.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  const region = useRef<HTMLOListElement>(null)
  const latest = toasts[toasts.length - 1]
  const topId = latest?.id
  const count = toasts.length

  useEffect(() => {
    const el = region.current
    if (!el || typeof el.showPopover !== 'function') return
    // Re-showing moves the stack above a dialog that opened after the previous toast.
    if (el.matches(':popover-open')) el.hidePopover()
    if (count > 0) el.showPopover()
  }, [topId, count])

  const speak = (assertive: boolean): string => {
    if (!latest || (latest.tone === 'error') !== assertive) return ''
    return [TONE_WORD[latest.tone], latest.title, latest.message].filter(Boolean).join('. ')
  }

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">
        {speak(false)}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive">
        {speak(true)}
      </div>
      <ol ref={region} popover="manual" aria-label="Notifications" className={styles.region}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </ol>
    </>
  )
}
