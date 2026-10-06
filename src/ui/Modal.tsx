import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject, type SyntheticEvent } from 'react'
import { IconButton } from './Button'
import { cx } from './internal/cx'
import styles from './Modal.module.css'

/** Shared engine for Dialog and Drawer, built on the native modal <dialog>. */
export interface ModalBaseProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  /** Esc and a click on the backdrop close it. Turn off for a prompt that must be answered. */
  dismissible?: boolean
  /** Element to focus on open. Default: the first `[data-autofocus]`, else the first focusable control. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** `alertdialog` for interruptions that need a decision. */
  role?: 'dialog' | 'alertdialog'
  className?: string
  children: ReactNode
}

interface ModalProps extends ModalBaseProps {
  variant: 'dialog' | 'drawer'
  variantClass: string
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/*
 * Why a native <dialog>: showModal() gives a real focus trap, Esc handling, an inert background
 * and top-layer stacking for free. We add what it lacks: returning focus when the component is
 * unmounted while open, backdrop click that ignores drags started inside, initial focus, and a
 * Tab cycle: natively, tabbing past the last control hands focus to the browser chrome.
 */
export function Modal({ open, onClose, title, description, footer, dismissible = true, initialFocusRef, role = 'dialog', className, children, variant, variantClass }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const pointerDownOnBackdrop = useRef(false)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el || !open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!el.open) el.showModal()
    const body = el.querySelector<HTMLElement>(`.${styles.body}`)
    const target = initialFocusRef?.current ?? el.querySelector<HTMLElement>('[data-autofocus]') ?? body?.querySelector<HTMLElement>(FOCUSABLE) ?? el.querySelector<HTMLElement>(FOCUSABLE)
    target?.focus()
    return () => {
      if (el.open) el.close()
      if (previous?.isConnected) previous.focus()
    }
  }, [open, initialFocusRef])

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>): void => {
    if (e.key !== 'Tab' || e.defaultPrevented) return
    const stops = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.getClientRects().length > 0)
    const first = stops[0]
    const last = stops[stops.length - 1]
    if (!first || !last) return
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === e.currentTarget)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const onCancel = (e: SyntheticEvent<HTMLDialogElement>): void => {
    e.preventDefault()
    if (dismissible) onClose()
  }

  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, variantClass, className)}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={onCancel}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        pointerDownOnBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget && pointerDownOnBackdrop.current) onClose()
      }}
    >
      {open ? (
        <div className={styles.panel} data-variant={variant}>
          <header className={styles.head}>
            <div className={styles.heading}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {description ? (
                <p id={descId} className={styles.desc}>
                  {description}
                </p>
              ) : null}
            </div>
            {dismissible ? <IconButton icon="x" label="Close" variant="quiet" size="sm" onClick={onClose} /> : null}
          </header>
          <div className={styles.body}>{children}</div>
          {footer ? <footer className={styles.foot}>{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  )
}
